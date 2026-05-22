export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWAMessage, validateWAConfig } from "@/lib/whatsapp";
import { sendTelegramMessage, sendTelegramDM, escMD } from "@/lib/telegram";

// ── Helpers ───────────────────────────────────────────────────────────────────
const PRIORIDADE_LABEL: Record<number, string> = {
  1: "1 - Muito Baixa", 2: "2 - Baixa", 3: "3 - Média",
  4: "4 - Alta",        5: "5 - Crítica",
};

type ItemLinha = { descricao: string; quantidade: number; unidade: string };

function buildMsgBody(sc: {
  numero: string;
  filialNome: string;
  solicitante: string | null;
  createdAt: Date;
  itens: ItemLinha[];
  valorTotal: string | null;
  prioridade: number;
  justificativa: string | null;
  etapaNome?: string;
}): string {
  const data = sc.createdAt.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const linhasItens = sc.itens.map((it, i) =>
    `  ${i + 1}. ${it.descricao} — ${it.quantidade.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${it.unidade}`
  );

  return [
    `*Ordem de Compras Nº ${sc.numero}*`,
    ``,
    `• *Filial:* ${sc.filialNome}`,
    `• *Solicitado por:* ${sc.solicitante ?? "—"}`,
    `• *Data:* ${data}`,
    `• *Prioridade:* ${PRIORIDADE_LABEL[sc.prioridade] ?? sc.prioridade}`,
    ...(sc.valorTotal ? [`• *Valor total:* ${sc.valorTotal}`] : []),
    ...(sc.justificativa ? [`• *Descrição:* ${sc.justificativa}`] : []),
    ``,
    `*Itens (${sc.itens.length}):*`,
    ...linhasItens,
    ``,
    ...(sc.etapaNome ? [`_Etapa: ${sc.etapaNome}_`, ``] : []),
    `Responda com um dos botões abaixo:`,
  ].join("\n");
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json().catch(() => ({}));
    // modo: "fluxo" = usa AprovacaoFluxo ativo com alçadas | "direto" = aprovadorId ou colaboradorId obrigatório
    const modo:           "fluxo" | "direto" = body.modo ?? "fluxo";
    const aprovadorId:    string | undefined  = body.aprovadorId;
    const colaboradorId:  string | undefined  = body.colaboradorId;
    // sendWA: false skips WhatsApp sending (used by the "Confirmar" / in-system path)
    const sendWA: boolean = body.sendWA !== false;

    // ── Load SC ──────────────────────────────────────────────────────────────
    const sc = await prisma.necessidadeCompra.findUnique({
      where: { id: params.id },
      include: {
        filial: true,
        itens: {
          include: {
            item: { select: { descricao: true, precoCusto: true, unidadeMedida: true, unidade: { select: { sigla: true } } } },
          },
        },
      },
    });

    if (!sc) return NextResponse.json({ error: "SC não encontrada" }, { status: 404 });

    if (!["RASCUNHO", "AGUARDANDO_APROVACAO", "REJEITADA"].includes(sc.status)) {
      return NextResponse.json(
        { error: `SC com status ${sc.status} não pode ser submetida para aprovação` },
        { status: 400 }
      );
    }

    // ── Calculate valor total from item precoCusto ────────────────────────────
    let valorTotalNum: number | null = null;
    for (const it of sc.itens) {
      const custo = it.item?.precoCusto;
      if (custo != null) {
        const qtd = parseFloat(String(it.quantidade ?? 0));
        const val = parseFloat(String(custo));
        valorTotalNum = (valorTotalNum ?? 0) + qtd * val;
      }
    }
    const valorTotalStr = valorTotalNum != null
      ? valorTotalNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : null;

    // ── Resolve aprovador ─────────────────────────────────────────────────────
    let etapaOrdem = 1;
    let etapaNome: string | undefined;
    let fluxoId: string | null = null;
    let aprovadorResolved: { id: string; nome: string; telefone: string | null };

    if (modo === "direto") {
      if (!aprovadorId && !colaboradorId) {
        return NextResponse.json({ error: "aprovadorId ou colaboradorId é obrigatório no modo direto" }, { status: 400 });
      }

      if (colaboradorId) {
        const c = await prisma.colaborador.findUnique({ where: { id: colaboradorId } });
        if (!c) return NextResponse.json({ error: "Colaborador não encontrado" }, { status: 404 });
        // Use colaborador's telefone; fall back to linked usuario's telefone
        let telefone = c.telefone ?? null;
        if (!telefone && c.usuarioId) {
          const u = await prisma.usuario.findUnique({ where: { id: c.usuarioId }, select: { telefone: true } });
          telefone = u?.telefone ?? null;
        }
        // For AprovacaoSC we still need a usuario id — use linked usuario or fall back to any admin
        const usuarioId = c.usuarioId;
        if (!usuarioId) {
          return NextResponse.json(
            { error: `O colaborador "${c.nome}" não tem usuário do sistema vinculado. Vincule um usuário ao colaborador para usar o fluxo de aprovação.` },
            { status: 422 }
          );
        }
        const u = await prisma.usuario.findUnique({ where: { id: usuarioId } });
        if (!u) return NextResponse.json({ error: "Usuário vinculado ao colaborador não encontrado" }, { status: 404 });
        aprovadorResolved = { id: u.id, nome: c.nome, telefone };
      } else {
        const u = await prisma.usuario.findUnique({ where: { id: aprovadorId! } });
        if (!u) return NextResponse.json({ error: "Aprovador não encontrado" }, { status: 404 });
        aprovadorResolved = { id: u.id, nome: u.nome, telefone: u.telefone ?? null };
      }
      etapaNome = "Aprovação Direta";
    } else {
      // Fluxo mode: pick active fluxo for SOLICITACAO_COMPRAS, match etapa by valor
      const fluxo = await prisma.aprovacaoFluxo.findFirst({
        where: { ativo: true, processo: "SOLICITACAO_COMPRAS" as import("@prisma/client").ProcessoAprovacao },
        include: {
          etapas: {
            include: { aprovador: true, colaborador: true },
            orderBy: { ordem: "asc" },
          },
        },
      });

      if (!fluxo || fluxo.etapas.length === 0) {
        return NextResponse.json(
          { error: "Nenhum fluxo de aprovação ativo configurado. Configure em Configurações → Aprovações ou use o modo aprovador direto." },
          { status: 422 }
        );
      }

      fluxoId = fluxo.id;

      // Match etapa by valor total (if no ranges set, use first etapa)
      let etapa = fluxo.etapas[0];
      if (valorTotalNum != null) {
        const matched = fluxo.etapas.find((e) => {
          const min = e.valorMin != null ? parseFloat(String(e.valorMin)) : null;
          const max = e.valorMax != null ? parseFloat(String(e.valorMax)) : null;
          if (min != null && valorTotalNum! < min) return false;
          if (max != null && valorTotalNum! > max) return false;
          return true;
        });
        if (matched) etapa = matched;
      }

      etapaOrdem = etapa.ordem;
      etapaNome  = etapa.nome ?? `Etapa ${etapa.ordem}`;

      if (etapa.colaborador) {
        // Prefer colaborador's telefone, fall back to usuario's
        const c = etapa.colaborador;
        let telefone = c.telefone ?? null;
        if (!telefone && c.usuarioId) {
          const u = await prisma.usuario.findUnique({ where: { id: c.usuarioId }, select: { telefone: true } });
          telefone = u?.telefone ?? null;
        }
        // Still need a usuario for AprovacaoSC.aprovadorId
        if (!c.usuarioId) {
          return NextResponse.json(
            { error: `O colaborador "${c.nome}" não tem usuário do sistema vinculado.` },
            { status: 422 }
          );
        }
        aprovadorResolved = { id: c.usuarioId, nome: c.nome, telefone };
      } else if (etapa.aprovador) {
        aprovadorResolved = {
          id: etapa.aprovador.id,
          nome: etapa.aprovador.nome,
          telefone: etapa.aprovador.telefone ?? null,
        };
      } else {
        return NextResponse.json({ error: "Etapa sem aprovador configurado" }, { status: 422 });
      }
    }

    // ── Garantir 1 aprovação pendente por pessoa por SC ──────────────────────
    // Remove entradas PENDENTE anteriores para este aprovador nesta SC
    // para evitar duplicatas ao reenviar.
    await prisma.aprovacaoSC.deleteMany({
      where: {
        necessidadeId: sc.id,
        aprovadorId:   aprovadorResolved.id,
        status:        "PENDENTE",
      },
    });

    // ── Create AprovacaoSC ────────────────────────────────────────────────────
    const aprovacao = await prisma.aprovacaoSC.create({
      data: {
        necessidadeId: sc.id,
        fluxoId,
        etapaOrdem,
        etapaNome: etapaNome ?? null,
        aprovadorId: aprovadorResolved.id,
        status: "PENDENTE",
      },
    });

    // ── Update SC status ──────────────────────────────────────────────────────
    await prisma.necessidadeCompra.update({
      where: { id: sc.id },
      data: { status: "AGUARDANDO_APROVACAO" },
    });

    // ── Send WA (best-effort — never fails the request) ───────────────────────
    let waMsgId: string | null = null;
    let waError: string | null = null;

    if (sendWA && aprovadorResolved.telefone) {
      try {
        const waCheck = await validateWAConfig();
        if (!waCheck.ok) {
          waError = waCheck.error;
        } else {
          const filialNome = sc.filial
            ? sc.filial.nomeFantasia ?? sc.filial.razaoSocial
            : "—";

          const msgBody = buildMsgBody({
            numero: sc.numero,
            filialNome,
            solicitante: sc.solicitante,
            createdAt: sc.createdAt,
            itens: sc.itens.map((it) => ({
              descricao: it.item.descricao,
              quantidade: parseFloat(String(it.quantidade ?? 0)),
              unidade: it.unidade ?? it.item.unidade?.sigla ?? it.item.unidadeMedida ?? "un",
            })),
            valorTotal: valorTotalStr,
            prioridade: sc.prioridade,
            justificativa: sc.justificativa,
            etapaNome,
          });

          // Normalize Brazilian phone
          const rawPhone = aprovadorResolved.telefone.replace(/\D/g, "");
          const phone = rawPhone.startsWith("55") ? rawPhone : `55${rawPhone}`;
          const waResult = await sendWAMessage({
            to: phone,
            body: msgBody,
            buttons: [
              { id: `sc_APPROVE_${aprovacao.id}`, title: "✅ Aprovar" },
              { id: `sc_REJECT_${aprovacao.id}`,  title: "❌ Reprovar" },
              { id: `sc_VIEW_${aprovacao.id}`,    title: "🔍 Detalhes" },
            ],
          });
          waMsgId = waResult.msgId;
          await prisma.aprovacaoSC.update({
            where: { id: aprovacao.id },
            data:  { waMsgId },
          });
        }
      } catch (waErr) {
        waError = waErr instanceof Error ? waErr.message : "Erro ao enviar WhatsApp";
        console.warn("[submeter-aprovacao] WA send failed (non-blocking):", waError);
      }
    } else if (sendWA && !aprovadorResolved.telefone) {
      waError = `O aprovador "${aprovadorResolved.nome}" não tem telefone cadastrado.`;
    }

    // ── Send Telegram DM to approver (best-effort) ────────────────────────────
    let approverTgChatId: string | null = null;
    try {
      const col = await prisma.colaborador.findFirst({
        where: { usuarioId: aprovadorResolved.id },
        select: { telegramChatId: true },
      });
      approverTgChatId = col?.telegramChatId ?? null;
    } catch { /* ignore */ }

    if (approverTgChatId) {
      try {
        const filialNome = sc.filial ? sc.filial.nomeFantasia ?? sc.filial.razaoSocial : "—";
        const linhas = sc.itens.map((it, i) => {
          const qtd = parseFloat(String(it.quantidade ?? 0)).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
          const un  = (it as { unidade?: string | null }).unidade ?? it.item.unidade?.sigla ?? it.item.unidadeMedida ?? "un";
          return `  ${i + 1}\\. ${escMD(it.item.descricao)} — ${escMD(qtd)} ${escMD(un)}`;
        });
        const prioLabel = { 1: "Muito Baixa", 2: "Baixa", 3: "Média", 4: "Alta", 5: "🔴 Crítica" }[sc.prioridade] ?? String(sc.prioridade);
        const dataStr = sc.createdAt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

        const lines = [
          `🛒 *Aprovação necessária — SC Nº ${escMD(sc.numero)}*`,
          ``,
          `• *Filial:* ${escMD(filialNome)}`,
          `• *Solicitado por:* ${escMD(sc.solicitante ?? "—")}`,
          `• *Data:* ${escMD(dataStr)}`,
          `• *Prioridade:* ${escMD(prioLabel)}`,
          ...(valorTotalStr ? [`• *Valor estimado:* ${escMD(valorTotalStr)}`] : []),
          ...(sc.justificativa ? [`• *Descrição:* ${escMD(sc.justificativa)}`] : []),
          ``,
          `*Itens \\(${sc.itens.length}\\):*`,
          ...linhas,
          ``,
          `_Selecione uma ação abaixo:_`,
        ];

        await sendTelegramDM(approverTgChatId, {
          text: lines.join("\n"),
          inlineKeyboard: [[
            { text: "✅ Aprovar",  callbackData: `sc_APPROVE_${aprovacao.id}` },
            { text: "❌ Reprovar", callbackData: `sc_REJECT_${aprovacao.id}` },
          ]],
        });
      } catch (tgDMErr) {
        console.warn("[submeter-aprovacao] Telegram DM failed (non-blocking):", tgDMErr);
      }
    }

    // ── Send Telegram (best-effort — never fails the request) ────────────────
    try {
      const filialNome = sc.filial ? sc.filial.nomeFantasia ?? sc.filial.razaoSocial : "—";
      const linhas = sc.itens.map((it, i) => {
        const qtd = parseFloat(String(it.quantidade ?? 0)).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
        const un  = (it as { unidade?: string | null }).unidade ?? it.item.unidade?.sigla ?? it.item.unidadeMedida ?? "un";
        return `  ${i + 1}\\. ${escMD(it.item.descricao)} — ${escMD(qtd)} ${escMD(un)}`;
      });

      const prioLabel = { 1: "Muito Baixa", 2: "Baixa", 3: "Média", 4: "Alta", 5: "🔴 Crítica" }[sc.prioridade] ?? String(sc.prioridade);
      const dataStr = sc.createdAt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

      const lines: string[] = [
        `🛒 *Solicitação de Compras Nº ${escMD(sc.numero)}*`,
        ``,
        `• *Filial:* ${escMD(filialNome)}`,
        `• *Solicitado por:* ${escMD(sc.solicitante ?? "—")}`,
        `• *Data:* ${escMD(dataStr)}`,
        `• *Prioridade:* ${escMD(prioLabel)}`,
        ...(valorTotalStr ? [`• *Valor estimado:* ${escMD(valorTotalStr)}`] : []),
        ...(sc.justificativa ? [`• *Descrição:* ${escMD(sc.justificativa)}`] : []),
        ``,
        `*Itens \\(${sc.itens.length}\\):*`,
        ...linhas,
        ``,
        `👤 *Aprovador:* ${escMD(aprovadorResolved.nome)}`,
        ``,
        `_Acesse o ERP para aprovar ou reprovar\\._`,
      ];

      await sendTelegramMessage({ text: lines.join("\n") });
    } catch (tgErr) {
      console.warn("[submeter-aprovacao] Telegram send failed (non-blocking):", tgErr);
    }

    return NextResponse.json({
      data: { id: aprovacao.id, aprovadorNome: aprovadorResolved.nome, waMsgId },
      waError, // null when WA was sent; message when it failed or was skipped
    }, { status: 201 });
  } catch (err) {
    console.error("[POST submeter-aprovacao]", err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
