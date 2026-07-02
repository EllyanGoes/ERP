export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sendWAMessage, validateWAConfig } from "@/lib/whatsapp";
import { sendTelegramDM, escMD } from "@/lib/telegram";

// CANCELADA é um cancelamento "soft" (não exclui registros): disponível em todos os
// estados de trabalho, exceto nos terminais já atendidos. É um estado final.
const TRANSITIONS: Record<string, string[]> = {
  // A aprovação migrou para a cotação → a SC vai direto de RASCUNHO p/ APROVADA
  // (sem etapa de aprovação da SC). AGUARDANDO_APROVACAO mantido p/ registros antigos.
  RASCUNHO:             ["APROVADA", "AGUARDANDO_APROVACAO", "CANCELADA"],
  AGUARDANDO_APROVACAO: ["APROVADA", "REJEITADA", "CANCELADA"],
  APROVADA:             ["EM_COTACAO", "EM_PEDIDO", "CANCELADA"],
  REJEITADA:            ["AGUARDANDO_APROVACAO", "CANCELADA"],
  EM_COTACAO:           ["EM_PEDIDO", "TOTALMENTE_ATENDIDA", "PARCIALMENTE_ATENDIDA", "CANCELADA"],
  EM_PEDIDO:            ["TOTALMENTE_ATENDIDA", "PARCIALMENTE_ATENDIDA", "CANCELADA"],
  TOTALMENTE_ATENDIDA:  [],
  PARCIALMENTE_ATENDIDA: [],
  CANCELADA:            [],
};

// Quando a SC é aprovada/reprovada pela web, as aprovações que foram disparadas por
// WhatsApp/Telegram (AprovacaoSC PENDENTE) ficam "presas": os botões continuam lá como
// se ainda fosse preciso responder. Aqui resolvemos essas aprovações — assim os webhooks
// passam a ignorar cliques antigos (eles só agem em status === "PENDENTE") — e avisamos o
// aprovador nos dois canais que a decisão já foi tomada. O WhatsApp não permite editar
// mensagens (só enviar uma nova) e a mensagem original do Telegram não tem o id armazenado
// para editar no lugar, então usamos uma mensagem de acompanhamento nos dois canais.
async function notifyAprovacoesResolvidas(
  scId: string,
  decisao: "APROVADA" | "REJEITADA",
  opts: { quemAprovou?: string | null; motivoReprovacao?: string | null }
) {
  const pendentes = await prisma.aprovacaoSC.findMany({
    where: { necessidadeId: scId, status: "PENDENTE" },
    include: { aprovador: { select: { id: true, nome: true, telefone: true } } },
  });
  if (pendentes.length === 0) return; // SC não passou pelo fluxo WhatsApp/Telegram

  const novoStatus = decisao === "APROVADA" ? "APROVADO" : "REPROVADO";

  // 1) Resolver as aprovações primeiro (mesmo que o aviso falhe, os botões antigos
  //    deixam de funcionar porque os webhooks checam status === "PENDENTE").
  await prisma.aprovacaoSC.updateMany({
    where: { necessidadeId: scId, status: "PENDENTE" },
    data: {
      status: novoStatus,
      respondidoEm: new Date(),
      observacao:
        decisao === "APROVADA"
          ? `Aprovada via sistema web${opts.quemAprovou ? ` por ${opts.quemAprovou}` : ""}`
          : `Reprovada via sistema web${opts.motivoReprovacao ? ` — ${opts.motivoReprovacao}` : ""}`,
    },
  });

  // 2) Número da SC para a mensagem
  const sc = await prisma.necessidadeCompra.findUnique({
    where: { id: scId },
    select: { numero: true },
  });
  const numero = sc?.numero ?? "—";
  const icone = decisao === "APROVADA" ? "✅" : "❌";
  const verbo = decisao === "APROVADA" ? "APROVADA" : "REPROVADA";

  // 3) Avisar cada aprovador nos dois canais (best-effort — nunca lança)
  const waCfg = await validateWAConfig();
  const waOk = waCfg.ok;

  for (const ap of pendentes) {
    // Contatos: telefone (colaborador → usuário) e telegramChatId
    let telefone: string | null = ap.aprovador.telefone ?? null;
    let tgChatId: string | null = null;
    try {
      const col = await prisma.colaborador.findFirst({
        where: { usuarioId: ap.aprovadorId },
        select: { telefone: true, telegramChatId: true },
      });
      telefone = col?.telefone ?? telefone;
      tgChatId = col?.telegramChatId ?? null;
    } catch {
      /* ignore */
    }

    // ── WhatsApp (mensagem de acompanhamento; WA não permite editar) ────────────
    if (waOk && telefone) {
      try {
        const body = [
          `${icone} A SC Nº ${numero} foi *${verbo}* pelo sistema.`,
          ...(decisao === "APROVADA" && opts.quemAprovou ? [`Decisão de: ${opts.quemAprovou}`] : []),
          ...(decisao === "REJEITADA" && opts.motivoReprovacao ? [`Motivo: ${opts.motivoReprovacao}`] : []),
          ``,
          `Esta solicitação já foi decidida — não é necessário responder por aqui.`,
        ].join("\n");
        const rawPhone = telefone.replace(/\D/g, "");
        const phone = rawPhone.startsWith("55") ? rawPhone : `55${rawPhone}`;
        await sendWAMessage({
          to: phone,
          body,
          buttons: [{ id: `sc_VIEW_${ap.id}`, title: "🔍 Ver SC" }],
        });
      } catch (e) {
        console.warn("[status PATCH] WhatsApp follow-up falhou (não bloqueante):", e);
      }
    }

    // ── Telegram (mensagem de acompanhamento) ───────────────────────────────────
    if (tgChatId) {
      try {
        const linhas = [
          `${icone} *SC Nº ${escMD(numero)} — ${verbo}*`,
          ``,
          ...(decisao === "APROVADA" && opts.quemAprovou
            ? [`Decisão registrada via sistema web por *${escMD(opts.quemAprovou)}*\\.`]
            : [`Decisão registrada via sistema web\\.`]),
          ...(decisao === "REJEITADA" && opts.motivoReprovacao
            ? [``, `*Motivo:* ${escMD(opts.motivoReprovacao)}`]
            : []),
          ``,
          `_Esta solicitação já foi decidida — não é necessário responder por aqui\\._`,
        ];
        await sendTelegramDM(tgChatId, { text: linhas.join("\n") });
      } catch (e) {
        console.warn("[status PATCH] Telegram follow-up falhou (não bloqueante):", e);
      }
    }
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const { status, motivoReprovacao, motivoCancelamento } = body;

  const current = await prisma.necessidadeCompra.findUnique({
    where: { id: params.id },
    select: { status: true },
  });

  if (!current) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const allowed = TRANSITIONS[current.status] ?? [];
  if (!allowed.includes(status)) {
    return NextResponse.json(
      { error: `Transição inválida: ${current.status} → ${status}` },
      { status: 422 }
    );
  }

  const updateData: Record<string, unknown> = { status };
  if (status === "AGUARDANDO_APROVACAO") {
    // No extra fields
  } else if (status === "APROVADA") {
    // Quem "aprova" (confirma/libera p/ cotação) é o USUÁRIO DA SESSÃO — o body
    // não pode nomear um aprovador arbitrário (a aprovação real é na cotação).
    updateData.aprovadoPor = auth.session.nome ?? null;
    updateData.dataAprovacao = new Date();
  } else if (status === "REJEITADA") {
    updateData.motivoReprovacao = motivoReprovacao || null;
    updateData.dataAprovacao = new Date();
  } else if (status === "CANCELADA") {
    updateData.motivoCancelamento = motivoCancelamento || null;
    updateData.dataCancelamento = new Date();
  }

  const record = await prisma.necessidadeCompra.update({
    where: { id: params.id },
    data: updateData,
  });

  // Sincroniza as aprovações enviadas por WhatsApp/Telegram com a decisão tomada na web:
  // resolve as AprovacaoSC pendentes e avisa o aprovador nos dois canais. Best-effort —
  // nunca derruba a atualização de status.
  if (status === "APROVADA" || status === "REJEITADA") {
    try {
      await notifyAprovacoesResolvidas(params.id, status, {
        quemAprovou: auth.session.nome ?? null,
        motivoReprovacao: motivoReprovacao || null,
      });
    } catch (e) {
      console.warn("[status PATCH] sincronização de aprovações falhou (não bloqueante):", e);
    }
  }

  return NextResponse.json({ data: record });
}
