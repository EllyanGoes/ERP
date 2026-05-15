export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWAMessage } from "@/lib/whatsapp";

// ── Helpers ───────────────────────────────────────────────────────────────────
const PRIORIDADE_LABEL: Record<number, string> = {
  1: "1 - Muito Baixa", 2: "2 - Baixa", 3: "3 - Média",
  4: "4 - Alta",        5: "5 - Crítica",
};

function buildMsgBody(sc: {
  numero: string;
  filialNome: string;
  solicitante: string | null;
  createdAt: Date;
  totalItens: number;
  valorTotal: string | null;
  prioridade: number;
  justificativa: string | null;
  etapaNome?: string;
}): string {
  const data = sc.createdAt.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  return [
    `*Ordem de Compras Nº ${sc.numero}*`,
    ``,
    `• *Filial:* ${sc.filialNome}`,
    `• *Solicitado por:* ${sc.solicitante ?? "—"}`,
    `• *Data:* ${data}`,
    `• *Total de produtos:* ${sc.totalItens}`,
    ...(sc.valorTotal ? [`• *Valor total:* ${sc.valorTotal}`] : []),
    `• *Prioridade:* ${PRIORIDADE_LABEL[sc.prioridade] ?? sc.prioridade}`,
    ...(sc.justificativa ? [`• *Descrição:* ${sc.justificativa}`] : []),
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
    // modo: "fluxo" = usa AprovacaoFluxo ativo com alçadas | "direto" = aprovadorId obrigatório
    const modo:        "fluxo" | "direto" = body.modo ?? "fluxo";
    const aprovadorId: string | undefined  = body.aprovadorId;

    // ── Load SC ──────────────────────────────────────────────────────────────
    const sc = await prisma.necessidadeCompra.findUnique({
      where: { id: params.id },
      include: {
        filial: true,
        itens: {
          include: { item: { select: { precoCusto: true } } },
        },
      },
    });

    if (!sc) return NextResponse.json({ error: "SC não encontrada" }, { status: 404 });

    if (sc.status !== "RASCUNHO" && sc.status !== "AGUARDANDO_APROVACAO") {
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
    let aprovadorResolved: { id: string; nome: string; telefone: string | null };

    if (modo === "direto") {
      if (!aprovadorId) return NextResponse.json({ error: "aprovadorId é obrigatório no modo direto" }, { status: 400 });
      const u = await prisma.usuario.findUnique({ where: { id: aprovadorId } });
      if (!u) return NextResponse.json({ error: "Aprovador não encontrado" }, { status: 404 });
      aprovadorResolved = { id: u.id, nome: u.nome, telefone: u.telefone ?? null };
      etapaNome = "Aprovação Direta";
    } else {
      // Fluxo mode: pick active fluxo, match etapa by valor
      const fluxo = await prisma.aprovacaoFluxo.findFirst({
        where: { ativo: true },
        include: {
          etapas: { include: { aprovador: true }, orderBy: { ordem: "asc" } },
        },
      });

      if (!fluxo || fluxo.etapas.length === 0) {
        return NextResponse.json(
          { error: "Nenhum fluxo de aprovação ativo configurado. Configure em Configurações → Aprovações ou use o modo aprovador direto." },
          { status: 422 }
        );
      }

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
      aprovadorResolved = {
        id: etapa.aprovador.id,
        nome: etapa.aprovador.nome,
        telefone: etapa.aprovador.telefone ?? null,
      };
    }

    if (!aprovadorResolved.telefone) {
      return NextResponse.json(
        { error: `O aprovador "${aprovadorResolved.nome}" não tem telefone cadastrado. Cadastre em Configurações → Usuários.` },
        { status: 422 }
      );
    }

    // ── Build WA message ──────────────────────────────────────────────────────
    const filialNome = sc.filial
      ? sc.filial.nomeFantasia ?? sc.filial.razaoSocial
      : "—";

    const msgBody = buildMsgBody({
      numero: sc.numero,
      filialNome,
      solicitante: sc.solicitante,
      createdAt: sc.createdAt,
      totalItens: sc.itens.length,
      valorTotal: valorTotalStr,
      prioridade: sc.prioridade,
      justificativa: sc.justificativa,
      etapaNome,
    });

    // ── Create AprovacaoSC ────────────────────────────────────────────────────
    const aprovacao = await prisma.aprovacaoSC.create({
      data: {
        necessidadeId: sc.id,
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

    // ── Send WA ───────────────────────────────────────────────────────────────
    const phone = aprovadorResolved.telefone.replace(/\D/g, "");
    const waResult = await sendWAMessage({
      to: phone,
      body: msgBody,
      buttons: [
        { id: `sc_APPROVE_${aprovacao.id}`, title: "✅ Aprovar" },
        { id: `sc_REJECT_${aprovacao.id}`,  title: "❌ Reprovar" },
        { id: `sc_VIEW_${aprovacao.id}`,    title: "🔍 Detalhes" },
      ],
    });

    await prisma.aprovacaoSC.update({
      where: { id: aprovacao.id },
      data:  { waMsgId: waResult.msgId },
    });

    return NextResponse.json({
      data: { id: aprovacao.id, aprovadorNome: aprovadorResolved.nome, waMsgId: waResult.msgId },
    }, { status: 201 });
  } catch (err) {
    console.error("[POST submeter-aprovacao]", err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
