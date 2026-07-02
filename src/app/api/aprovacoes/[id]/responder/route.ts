export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { gerarPedidoDeCotacao, finalizarMensagemAprovacaoCotacao } from "@/lib/aprovacao-cotacao";
import { gerarContasPagarAntecipadoDoPedido } from "@/lib/contas-pagar";
import { notificarUsuario, marcarNotificacoesLidasPorLink } from "@/lib/notificacoes";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const acao: "APROVAR" | "REPROVAR" = body.acao;
    const observacao: string | undefined = body.observacao;

    if (acao !== "APROVAR" && acao !== "REPROVAR") {
      return NextResponse.json({ error: "acao deve ser APROVAR ou REPROVAR" }, { status: 400 });
    }

    // ── Find aprovacao ─────────────────────────────────────────────────────────
    const aprovacao = await prisma.aprovacaoSC.findUnique({
      where: { id: params.id },
      include: {
        aprovador: true,
        cotacao: { select: { id: true, numero: true, nome: true } },
      },
    });

    if (!aprovacao) {
      return NextResponse.json({ error: "Aprovação não encontrada" }, { status: 404 });
    }

    // Only the assigned approver (or an admin) can respond
    if (aprovacao.aprovadorId !== session.sub && session.perfil !== "ADMIN") {
      return NextResponse.json({ error: "Você não tem permissão para responder esta aprovação" }, { status: 403 });
    }

    if (aprovacao.status !== "PENDENTE") {
      return NextResponse.json({ error: "Esta aprovação já foi respondida" }, { status: 400 });
    }

    // ── Aprovação legada de SC (descontinuada) ─────────────────────────────────
    // A aprovação de compras migrou da Solicitação para a COTAÇÃO: só pendências
    // ligadas a uma cotação são processadas. Pendências antigas de SC (com
    // necessidadeId) não têm mais efeito por aqui.
    if (!aprovacao.cotacaoId) {
      return NextResponse.json(
        { error: "A aprovação na Solicitação foi descontinuada — a aprovação agora é na cotação (que gera o Pedido de Compras)." },
        { status: 410 },
      );
    }

    const novoStatus = acao === "APROVAR" ? "APROVADO" : "REPROVADO";
    const cotacaoId = aprovacao.cotacaoId;
    let novoPedidoNumero: string | null = null;

    try {
      if (novoStatus === "REPROVADO") {
        // Claim atômico: só quem virar a pendência PENDENTE→REPROVADO processa
        // (duas respostas concorrentes não reprovam duas vezes).
        await prisma.$transaction(async (tx) => {
          const claim = await tx.aprovacaoSC.updateMany({
            where: { id: aprovacao.id, status: "PENDENTE" },
            data: { status: "REPROVADO", observacao: observacao ?? null, respondidoEm: new Date() },
          });
          if (claim.count === 0) throw new Error("Esta aprovação já foi respondida");
          await tx.cotacaoCompra.update({
            where: { id: cotacaoId },
            data: { status: "EM_ANALISE", motivoReprovacao: observacao ?? null },
          });
        });
      } else {
        // Claim atômico como 1º statement DENTRO da mesma transação que gera o
        // pedido: duas aprovações concorrentes (web + Telegram, duplo clique)
        // não geram dois PCs — a segunda vê a pendência baixada e aborta com
        // rollback (a baixa da aprovação também desfaz se o pedido falhar).
        const out = await prisma.$transaction(async (tx) => {
          const claim = await tx.aprovacaoSC.updateMany({
            where: { id: aprovacao.id, status: "PENDENTE" },
            data: { status: "APROVADO", observacao: observacao ?? null, respondidoEm: new Date() },
          });
          if (claim.count === 0) throw new Error("Esta aprovação já foi respondida");
          return gerarPedidoDeCotacao(tx, cotacaoId);
        });
        novoPedidoNumero = out.pedidoCompra.numero;
        // PA: título antecipado nasce já no pedido (no-op se não for PA). Pós-commit.
        await gerarContasPagarAntecipadoDoPedido(out.pedidoCompra.id).catch((e) => {
          console.error("[responder] gerarContasPagarAntecipadoDoPedido falhou:", e);
        });
      }
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao aprovar cotação" }, { status: 400 });
    }

    // Atualiza a mensagem do aprovador (novo status, sem botões) — best-effort.
    await finalizarMensagemAprovacaoCotacao(aprovacao.id, novoStatus, aprovacao.aprovador.nome, novoPedidoNumero);

    // Sincroniza as notificações in-app (mesmo comportamento dos demais canais):
    const link = `/suprimentos/cotacoes/${cotacaoId}`;
    if (aprovacao.aprovadorId) {
      await marcarNotificacoesLidasPorLink(aprovacao.aprovadorId, link, "COTACAO_APROVACAO_SOLICITADA").catch(() => {});
    }
    if (aprovacao.solicitadoPor) {
      const ref = aprovacao.cotacao?.nome || aprovacao.cotacao?.numero || "";
      if (novoStatus === "APROVADO") {
        await notificarUsuario({
          usuarioId: aprovacao.solicitadoPor, tipo: "COTACAO_APROVADA", titulo: "Cotação aprovada",
          mensagem: `Sua cotação ${ref} foi aprovada — Pedido ${novoPedidoNumero} gerado.`, link,
        }).catch(() => {});
      } else {
        await notificarUsuario({
          usuarioId: aprovacao.solicitadoPor, tipo: "COTACAO_REPROVADA", titulo: "Cotação reprovada",
          mensagem: `Sua cotação ${ref} foi reprovada${observacao ? `: ${observacao}` : "."}`, link,
        }).catch(() => {});
      }
    }
    return NextResponse.json({ ok: true, status: novoStatus });
  } catch (err) {
    console.error("[POST responder]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 500 });
  }
}
