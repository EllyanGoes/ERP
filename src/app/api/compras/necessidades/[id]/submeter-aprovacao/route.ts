export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWAMessage } from "@/lib/whatsapp";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sc = await prisma.necessidadeCompra.findUnique({
      where: { id: params.id },
      include: {
        itens: true,
        filial: true,
      },
    });

    if (!sc) {
      return NextResponse.json({ error: "SC não encontrada" }, { status: 404 });
    }

    if (sc.status !== "RASCUNHO" && sc.status !== "AGUARDANDO_APROVACAO") {
      return NextResponse.json(
        { error: `SC com status ${sc.status} não pode ser submetida para aprovação` },
        { status: 400 }
      );
    }

    // Load active fluxo
    const fluxo = await prisma.aprovacaoFluxo.findFirst({
      where: { ativo: true },
      include: {
        etapas: {
          include: { aprovador: true },
          orderBy: { ordem: "asc" },
        },
      },
    });

    if (!fluxo || fluxo.etapas.length === 0) {
      return NextResponse.json(
        { error: "Nenhum fluxo de aprovação ativo configurado" },
        { status: 422 }
      );
    }

    // Determine applicable etapa by SC total value (sum of itens — items may not have price)
    // Since NecessidadeCompraItem doesn't have price, we use the first etapa or check valor ranges
    // For now: pick first etapa (valor ranges are optional filters for future use)
    const etapa = fluxo.etapas[0];

    if (!etapa.aprovador.telefone) {
      return NextResponse.json(
        { error: `O aprovador "${etapa.aprovador.nome}" não tem telefone cadastrado` },
        { status: 422 }
      );
    }

    // Create AprovacaoSC
    const aprovacao = await prisma.aprovacaoSC.create({
      data: {
        necessidadeId: sc.id,
        etapaOrdem: etapa.ordem,
        etapaNome: etapa.nome ?? null,
        aprovadorId: etapa.aprovadorId,
        status: "PENDENTE",
      },
      include: {
        aprovador: { select: { id: true, nome: true, email: true, telefone: true } },
      },
    });

    // Update SC status
    await prisma.necessidadeCompra.update({
      where: { id: sc.id },
      data: { status: "AGUARDANDO_APROVACAO" },
    });

    // Build WA message
    const filialNome = sc.filial
      ? sc.filial.nomeFantasia ?? sc.filial.razaoSocial
      : "—";
    const prioridadeLabel: Record<number, string> = {
      1: "Muito Baixa", 2: "Baixa", 3: "Média", 4: "Alta", 5: "Crítica",
    };

    const msgBody = [
      `*Nova SC para Aprovação* ✅`,
      ``,
      `*Solicitação Nº ${sc.numero}*`,
      ``,
      `• *Filial:* ${filialNome}`,
      `• *Solicitante:* ${sc.solicitante ?? "—"}`,
      `• *Prioridade:* ${prioridadeLabel[sc.prioridade] ?? sc.prioridade}`,
      `• *Itens:* ${sc.itens.length} produto(s)`,
      ``,
      `_Etapa: ${etapa.nome ?? `Etapa ${etapa.ordem}`}_`,
      ``,
      `Responda com um dos botões abaixo:`,
    ].join("\n");

    const phone = etapa.aprovador.telefone.replace(/\D/g, "");

    const waResult = await sendWAMessage({
      to: phone,
      body: msgBody,
      buttons: [
        { id: `sc_APPROVE_${aprovacao.id}`, title: "✅ Aprovar" },
        { id: `sc_REJECT_${aprovacao.id}`,  title: "❌ Reprovar" },
        { id: `sc_VIEW_${aprovacao.id}`,    title: "🔍 Detalhes" },
      ],
    });

    // Save WA message ID
    await prisma.aprovacaoSC.update({
      where: { id: aprovacao.id },
      data: { waMsgId: waResult.msgId },
    });

    return NextResponse.json({ data: { ...aprovacao, waMsgId: waResult.msgId } }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/compras/necessidades/[id]/submeter-aprovacao]", err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
