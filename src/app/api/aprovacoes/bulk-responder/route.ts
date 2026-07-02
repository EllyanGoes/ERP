export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { gerarPedidoDeCotacao, finalizarMensagemAprovacaoCotacao } from "@/lib/aprovacao-cotacao";
import { gerarContasPagarAntecipadoDoPedido } from "@/lib/contas-pagar";
import { notificarUsuario, marcarNotificacoesLidasPorLink } from "@/lib/notificacoes";

// POST /api/aprovacoes/bulk-responder
// Body: { ids: string[], acao: "APROVAR" | "REPROVAR", observacao?: string }
// Returns: { results: { id, status, error? }[] }
//
// Só aprovações de COTAÇÃO são processadas (a aprovação na SC foi descontinuada
// — pendências legadas com necessidadeId são puladas). Cada item usa o mesmo
// claim atômico do canal individual: a baixa da pendência acontece DENTRO da
// transação que gera o pedido, então respostas concorrentes não duplicam PC.

export async function POST(req: NextRequest) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids: string[]                  = Array.isArray(body.ids) ? body.ids : [];
  const acao: "APROVAR" | "REPROVAR"   = body.acao;
  const observacao: string | undefined = body.observacao;

  if (!ids.length)                               return NextResponse.json({ error: "Nenhum id informado" }, { status: 400 });
  if (acao !== "APROVAR" && acao !== "REPROVAR") return NextResponse.json({ error: "acao inválida" }, { status: 400 });

  const novoStatus = acao === "APROVAR" ? "APROVADO" : "REPROVADO";

  // Sequencial (não Promise.all): cada aprovação gera pedido/numeração em
  // transação própria — paralelizar só aumentaria contenção de locks.
  const results: Array<{ id: string; status: string; error?: string }> = [];
  for (const id of ids) {
    try {
      const aprovacao = await prisma.aprovacaoSC.findUnique({
        where: { id },
        include: {
          aprovador: true,
          cotacao: { select: { id: true, numero: true, nome: true } },
        },
      });

      if (!aprovacao) { results.push({ id, status: "error", error: "Não encontrada" }); continue; }
      if (aprovacao.aprovadorId !== session.sub && session.perfil !== "ADMIN") {
        results.push({ id, status: "error", error: "Sem permissão" }); continue;
      }
      if (aprovacao.status !== "PENDENTE") { results.push({ id, status: "skip", error: "Já respondida" }); continue; }
      if (!aprovacao.cotacaoId) {
        results.push({ id, status: "skip", error: "Aprovação de SC legada (descontinuada)" }); continue;
      }

      const cotacaoId = aprovacao.cotacaoId;
      let novoPedidoNumero: string | null = null;

      if (novoStatus === "REPROVADO") {
        await prisma.$transaction(async (tx) => {
          const claim = await tx.aprovacaoSC.updateMany({
            where: { id, status: "PENDENTE" },
            data: { status: "REPROVADO", observacao: observacao ?? null, respondidoEm: new Date() },
          });
          if (claim.count === 0) throw new Error("Já respondida");
          await tx.cotacaoCompra.update({
            where: { id: cotacaoId },
            data: { status: "EM_ANALISE", motivoReprovacao: observacao ?? null },
          });
        });
      } else {
        const out = await prisma.$transaction(async (tx) => {
          const claim = await tx.aprovacaoSC.updateMany({
            where: { id, status: "PENDENTE" },
            data: { status: "APROVADO", observacao: observacao ?? null, respondidoEm: new Date() },
          });
          if (claim.count === 0) throw new Error("Já respondida");
          return gerarPedidoDeCotacao(tx, cotacaoId);
        });
        novoPedidoNumero = out.pedidoCompra.numero;
        await gerarContasPagarAntecipadoDoPedido(out.pedidoCompra.id).catch((e) => {
          console.error("[bulk-responder] gerarContasPagarAntecipadoDoPedido falhou:", e);
        });
      }

      // Mensagem do Telegram + notificações in-app (best-effort).
      await finalizarMensagemAprovacaoCotacao(id, novoStatus, aprovacao.aprovador.nome, novoPedidoNumero);
      const link = `/suprimentos/cotacoes/${cotacaoId}`;
      await marcarNotificacoesLidasPorLink(aprovacao.aprovadorId, link, "COTACAO_APROVACAO_SOLICITADA").catch(() => {});
      if (aprovacao.solicitadoPor) {
        const ref = aprovacao.cotacao?.nome || aprovacao.cotacao?.numero || "";
        await notificarUsuario({
          usuarioId: aprovacao.solicitadoPor,
          tipo: novoStatus === "APROVADO" ? "COTACAO_APROVADA" : "COTACAO_REPROVADA",
          titulo: novoStatus === "APROVADO" ? "Cotação aprovada" : "Cotação reprovada",
          mensagem: novoStatus === "APROVADO"
            ? `Sua cotação ${ref} foi aprovada — Pedido ${novoPedidoNumero} gerado.`
            : `Sua cotação ${ref} foi reprovada${observacao ? `: ${observacao}` : "."}`,
          link,
        }).catch(() => {});
      }

      results.push({ id, status: "ok" });
    } catch (err) {
      results.push({ id, status: "error", error: err instanceof Error ? err.message : "Erro interno" });
    }
  }

  const ok    = results.filter((r) => r.status === "ok").length;
  const erros = results.filter((r) => r.status === "error").length;

  return NextResponse.json({ results, ok, erros });
}
