export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { gerarPedidoDeCotacao, finalizarMensagemAprovacaoCotacao } from "@/lib/aprovacao-cotacao";
import { sendWAMessage }                    from "@/lib/whatsapp";
import { sendTelegramMessage, escMD }       from "@/lib/telegram";
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
        necessidade: {
          include: {
            filial: true,
            itens: {
              include: {
                item: { select: { descricao: true, unidadeMedida: true, unidade: { select: { sigla: true } } } },
              },
            },
          },
        },
        fluxo: true,
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

    const novoStatus = acao === "APROVAR" ? "APROVADO" : "REPROVADO";

    // ── Update AprovacaoSC ─────────────────────────────────────────────────────
    await prisma.aprovacaoSC.update({
      where: { id: aprovacao.id },
      data: {
        status: novoStatus,
        observacao: observacao ?? null,
        respondidoEm: new Date(),
      },
    });

    // ── Aprovação de COTAÇÃO → gera o Pedido de Compras (uma única etapa) ──────
    if (aprovacao.cotacaoId) {
      const cotacaoId = aprovacao.cotacaoId;
      let novoPedidoNumero: string | null = null;
      try {
        if (novoStatus === "REPROVADO") {
          await prisma.cotacaoCompra.update({
            where: { id: cotacaoId },
            data: { status: "EM_ANALISE", motivoReprovacao: observacao ?? null },
          });
        } else {
          const out = await prisma.$transaction((tx) => gerarPedidoDeCotacao(tx, cotacaoId));
          novoPedidoNumero = out.pedidoCompra.numero;
        }
      } catch (e) {
        // Reverte a baixa da aprovação se a geração do pedido falhar.
        await prisma.aprovacaoSC.update({ where: { id: aprovacao.id }, data: { status: "PENDENTE", respondidoEm: null } });
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
    }

    const sc = aprovacao.necessidade;
    // Este endpoint trata aprovações de Solicitação de Compras. Aprovações de
    // cotação (cotacaoId) têm fluxo próprio e não passam por aqui.
    if (!sc) return NextResponse.json({ error: "Aprovação sem solicitação vinculada" }, { status: 400 });

    if (novoStatus === "REPROVADO") {
      // ── Reprovar SC ──────────────────────────────────────────────────────────
      // SC pode ser de outra empresa que não a ativa do aprovador → sem escopo.
      await prismaSemEscopo.necessidadeCompra.update({
        where: { id: sc.id },
        data: {
          status: "REJEITADA",
          motivoReprovacao: observacao
            ? `Reprovado por ${aprovacao.aprovador.nome} (etapa ${aprovacao.etapaOrdem}): ${observacao}`
            : `Reprovado por ${aprovacao.aprovador.nome} (etapa ${aprovacao.etapaOrdem})`,
        },
      });
    } else {
      // ── Aprovado — verificar próxima etapa ───────────────────────────────────
      const proxEtapa = await prisma.aprovacaoEtapa.findFirst({
        where: {
          ordem: { gt: aprovacao.etapaOrdem },
          ...(aprovacao.fluxoId
            ? { fluxoId: aprovacao.fluxoId }
            : { fluxo: { ativo: true } }),
        },
        include: { aprovador: true, colaborador: true },
        orderBy: { ordem: "asc" },
      });

      if (proxEtapa) {
        // Resolve phone and user for next etapa
        const proxColaborador = proxEtapa.colaborador;
        let proxTelefone = proxColaborador?.telefone ?? proxEtapa.aprovador?.telefone ?? null;
        if (!proxTelefone && proxColaborador?.usuarioId) {
          const u = await prisma.usuario.findUnique({ where: { id: proxColaborador.usuarioId }, select: { telefone: true } });
          proxTelefone = u?.telefone ?? null;
        }
        const proxAprovadorId = proxColaborador?.usuarioId ?? proxEtapa.aprovadorId ?? null;

        if (proxAprovadorId) {
          // Remover pendentes anteriores do mesmo aprovador nesta SC
          await prisma.aprovacaoSC.deleteMany({
            where: { necessidadeId: sc.id, aprovadorId: proxAprovadorId, status: "PENDENTE" },
          });

          const nova = await prisma.aprovacaoSC.create({
            data: {
              necessidadeId: sc.id,
              fluxoId: aprovacao.fluxoId,
              etapaOrdem: proxEtapa.ordem,
              etapaNome: proxEtapa.nome ?? null,
              aprovadorId: proxAprovadorId,
              status: "PENDENTE",
            },
          });

          // Try to send WA if phone configured (non-blocking)
          if (proxTelefone) {
            try {
              const rawPhone = proxTelefone.replace(/\D/g, "");
              const phone    = rawPhone.startsWith("55") ? rawPhone : `55${rawPhone}`;
              const filialNome = sc.filial ? sc.filial.nomeFantasia ?? sc.filial.razaoSocial : "—";
              const linhasItens = sc.itens.map((it, i) => {
                const qtd = parseFloat(String(it.quantidade ?? 0));
                const un  = (it as { unidade?: string | null }).unidade ?? it.item.unidade?.sigla ?? it.item.unidadeMedida ?? "un";
                return `  ${i + 1}. ${it.item.descricao} — ${qtd.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${un}`;
              });

              const msgBody = [
                `*Ordem de Compras Nº ${sc.numero}*`,
                ``,
                `• *Filial:* ${filialNome}`,
                `• *Solicitado por:* ${sc.solicitante ?? "—"}`,
                `• *Etapa:* ${proxEtapa.nome ?? `Etapa ${proxEtapa.ordem}`}`,
                ``,
                `*Itens (${sc.itens.length}):*`,
                ...linhasItens,
                ``,
                `Responda com um dos botões abaixo:`,
              ].join("\n");

              const waResult = await sendWAMessage({
                to: phone,
                body: msgBody,
                buttons: [
                  { id: `sc_APPROVE_${nova.id}`, title: "✅ Aprovar" },
                  { id: `sc_REJECT_${nova.id}`,  title: "❌ Reprovar" },
                  { id: `sc_VIEW_${nova.id}`,    title: "🔍 Detalhes" },
                ],
              });

              await prisma.aprovacaoSC.update({
                where: { id: nova.id },
                data: { waMsgId: waResult.msgId },
              });
            } catch (waErr) {
              console.warn("[responder] WA send failed for next etapa:", waErr);
              // Non-blocking — don't fail the whole request
            }
          }
        }
      } else {
        // Última etapa aprovada → SC aprovada (SC pode ser de outra empresa).
        await prismaSemEscopo.necessidadeCompra.update({
          where: { id: sc.id },
          data: {
            status: "APROVADA",
            aprovadoPor: aprovacao.aprovador.nome,
            dataAprovacao: new Date().toISOString(),
          },
        });
      }
    }

    // ── Telegram: notify result (best-effort) ────────────────────────────────
    try {
      const filialNome = sc.filial ? sc.filial.nomeFantasia ?? sc.filial.razaoSocial : "—";
      const icon = novoStatus === "APROVADO" ? "✅" : "❌";
      const verb = novoStatus === "APROVADO" ? "aprovada" : "reprovada";

      const lines: string[] = [
        `${icon} *SC Nº ${escMD(sc.numero)} foi ${verb}*`,
        ``,
        `• *Filial:* ${escMD(filialNome)}`,
        `• *Solicitado por:* ${escMD(sc.solicitante ?? "—")}`,
        `• *Decisão de:* ${escMD(aprovacao.aprovador.nome)}`,
        ...(observacao ? [`• *Observação:* ${escMD(observacao)}`] : []),
      ];

      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
        ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

      await sendTelegramMessage({
        text: lines.join("\n"),
        inlineKeyboard: [[
          { text: "📋 Ver SC", url: `${baseUrl}/compras/necessidades/${sc.id}` },
        ]],
      });
    } catch (tgErr) {
      console.warn("[responder] Telegram notify failed (non-blocking):", tgErr);
    }

    return NextResponse.json({ ok: true, status: novoStatus });
  } catch (err) {
    console.error("[POST responder]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 500 });
  }
}
