export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWAMessage } from "@/lib/whatsapp";

// ── Meta webhook verification ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token === process.env.META_WEBHOOK_VERIFY_TOKEN
  ) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ── Incoming webhook ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    let buttonPayload: string | null = null;

    // ── Meta format ───────────────────────────────────────────────────────────
    const metaMessage =
      body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (metaMessage?.type === "interactive") {
      buttonPayload = metaMessage.interactive?.button_reply?.id ?? null;
    }

    // ── Z-API format ──────────────────────────────────────────────────────────
    if (!buttonPayload && body?.buttonResponseMessage?.selectedButtonId) {
      buttonPayload = body.buttonResponseMessage.selectedButtonId;
    }

    if (!buttonPayload) {
      // Not a button response we care about — ack and move on
      return NextResponse.json({ ok: true });
    }

    // ── Parse payload: sc_APPROVE_{id} | sc_REJECT_{id} | sc_VIEW_{id} ───────
    const parts = buttonPayload.split("_");
    if (parts.length < 3 || parts[0] !== "sc") {
      return NextResponse.json({ ok: true });
    }

    const action = parts[1]; // "APPROVE" | "REJECT" | "VIEW"
    const aprovacaoSCId = parts.slice(2).join("_");

    if (action === "VIEW") {
      return NextResponse.json({ ok: true });
    }

    if (action !== "APPROVE" && action !== "REJECT") {
      return NextResponse.json({ ok: true });
    }

    // ── Find pending AprovacaoSC ──────────────────────────────────────────────
    const aprovacao = await prisma.aprovacaoSC.findUnique({
      where: { id: aprovacaoSCId },
      include: {
        necessidade: { include: { itens: true, filial: true } },
        aprovador: true,
      },
    });

    if (!aprovacao || aprovacao.status !== "PENDENTE") {
      return NextResponse.json({ ok: true });
    }

    const novoStatus = action === "APPROVE" ? "APROVADO" : "REPROVADO";

    // ── Update AprovacaoSC ────────────────────────────────────────────────────
    await prisma.aprovacaoSC.update({
      where: { id: aprovacaoSCId },
      data: {
        status: novoStatus,
        respondidoEm: new Date(),
      },
    });

    if (novoStatus === "REPROVADO") {
      // Reprove the SC
      await prisma.necessidadeCompra.update({
        where: { id: aprovacao.necessidadeId },
        data: {
          status: "REPROVADA",
          motivoReprovacao: `Reprovado via WhatsApp por ${aprovacao.aprovador.nome} (etapa ${aprovacao.etapaOrdem})`,
        },
      });
    } else {
      // Approved — check if there are more etapas
      const sc = aprovacao.necessidade;

      // Find the fluxo that contains an etapa with this ordem
      const proxEtapa = await prisma.aprovacaoEtapa.findFirst({
        where: {
          ordem: { gt: aprovacao.etapaOrdem },
          fluxo: { ativo: true },
        },
        include: { aprovador: true, colaborador: true },
        orderBy: { ordem: "asc" },
      });

      // Resolve telefone and usuarioId for next etapa
      const proxTelefone = proxEtapa?.colaborador?.telefone ?? proxEtapa?.aprovador?.telefone ?? null;
      const proxAprovadorId = proxEtapa?.colaborador?.usuarioId ?? proxEtapa?.aprovadorId ?? null;

      if (proxEtapa && proxTelefone && proxAprovadorId) {
        // Create next AprovacaoSC and send WA
        const nova = await prisma.aprovacaoSC.create({
          data: {
            necessidadeId: sc.id,
            etapaOrdem: proxEtapa.ordem,
            etapaNome: proxEtapa.nome ?? null,
            aprovadorId: proxAprovadorId,
            status: "PENDENTE",
          },
        });

        const filialNome = sc.filial
          ? sc.filial.nomeFantasia ?? sc.filial.razaoSocial
          : "—";

        const msgBody = [
          `*Nova SC para Aprovação* ✅`,
          ``,
          `*Solicitação Nº ${sc.numero}*`,
          ``,
          `• *Filial:* ${filialNome}`,
          `• *Solicitante:* ${sc.solicitante ?? "—"}`,
          `• *Prioridade:* ${sc.prioridade}`,
          `• *Itens:* ${sc.itens.length} produto(s)`,
          ``,
          `_Etapa: ${proxEtapa.nome ?? `Etapa ${proxEtapa.ordem}`}_`,
          ``,
          `Responda com um dos botões abaixo:`,
        ].join("\n");

        const waResult = await sendWAMessage({
          to: proxTelefone.replace(/\D/g, ""),
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
      } else {
        // No more etapas — approve the SC
        await prisma.necessidadeCompra.update({
          where: { id: aprovacao.necessidadeId },
          data: {
            status: "APROVADA",
            aprovadoPor: aprovacao.aprovador.nome,
            dataAprovacao: new Date(),
          },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook/whatsapp]", err);
    // Always return 200 to prevent Meta from retrying endlessly
    return NextResponse.json({ ok: true });
  }
}
