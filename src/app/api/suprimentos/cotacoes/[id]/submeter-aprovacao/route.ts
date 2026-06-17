export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { aprovadorPedidoCompras } from "@/lib/aprovacao-cotacao";
import { sendTelegramMessage, sendTelegramDocument, escMD } from "@/lib/telegram";
import { buildCotacaoPDF } from "@/lib/pdf-cotacao";

// POST /api/suprimentos/cotacoes/[id]/submeter-aprovacao
// O comprador envia a cotação para aprovação do gerente. Cria a pendência
// (AprovacaoSC ligada à cotação, 1 etapa, aprovador configurado em
// PEDIDO_COMPRAS) e move a cotação para AGUARDANDO_APROVACAO. O gerente aprova
// pela tela Aprovações (canal remoto) ou direto na cotação (ADMIN/aprovador).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const cfId = body.cfId as string | undefined;

    const cotacao = await prisma.cotacaoCompra.findUnique({
      where: { id: params.id },
      include: {
        necessidade: { select: { numero: true } },
        fornecedores: { select: { id: true, status: true } },
      },
    });
    if (!cotacao) return NextResponse.json({ error: "Cotação não encontrada" }, { status: 404 });
    if (cotacao.status === "CONCLUIDA") return NextResponse.json({ error: "Cotação já concluída" }, { status: 400 });
    if (!cotacao.fornecedores.some((f) => f.status === "RESPONDIDA")) {
      return NextResponse.json({ error: "Nenhum fornecedor respondeu a cotação ainda" }, { status: 400 });
    }

    const aprovador = await aprovadorPedidoCompras();

    const numeroRef = cotacao.nome || cotacao.necessidade?.numero || cotacao.numero;

    const aprovacaoId = await prisma.$transaction(async (tx) => {
      await tx.cotacaoCompra.update({
        where: { id: params.id },
        data: { status: "AGUARDANDO_APROVACAO" },
      });
      // Vencedor proposto pelo comprador (opcional) → melhorOpcao, que a
      // aprovação usa ao gerar o pedido.
      if (cfId) {
        await tx.cotacaoFornecedor.updateMany({ where: { cotacaoId: params.id }, data: { melhorOpcao: false } });
        await tx.cotacaoFornecedor.update({ where: { id: cfId }, data: { melhorOpcao: true } });
      }
      // Substitui pendências anteriores desta cotação.
      await tx.aprovacaoSC.deleteMany({ where: { cotacaoId: params.id, status: "PENDENTE" } });
      if (!aprovador) return null;
      const ap = await tx.aprovacaoSC.create({
        data: {
          cotacaoId: params.id,
          etapaOrdem: 1,
          etapaNome: aprovador.etapaNome,
          aprovadorId: aprovador.aprovadorId,
          fluxoId: aprovador.fluxoId,
          status: "PENDENTE",
        },
      });
      return ap.id;
    });

    // Notificação remota com botões inline (best-effort). Os mesmos botões
    // sc_APPROVE_/sc_REJECT_ que a SC usa — o webhook trata cotação pelo cotacaoId.
    // Envia o resumo da cotação em PDF (legenda + botões no próprio documento);
    // se o PDF falhar, cai numa mensagem de texto com os mesmos botões.
    if (aprovacaoId) {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
        ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
      const inlineKeyboard = [
        [
          { text: "✅ Aprovar", callbackData: `sc_APPROVE_${aprovacaoId}` },
          { text: "❌ Reprovar", callbackData: `sc_REJECT_${aprovacaoId}` },
        ],
        [{ text: "📋 Abrir cotação", url: `${baseUrl}/suprimentos/cotacoes/${params.id}` }],
      ];
      const caption = [
        `🧾 *Cotação aguardando aprovação*`,
        ``,
        `• *Cotação:* ${escMD(numeroRef)}`,
        ``,
        `Resumo em anexo\\. Aprovar gera o Pedido de Compras\\.`,
      ].join("\n");
      try {
        const pdf = await buildCotacaoPDF(params.id);
        const enviado = pdf
          ? await sendTelegramDocument({ filename: pdf.filename, buffer: pdf.buffer, caption, inlineKeyboard })
          : { ok: false as const };
        if (!enviado.ok) {
          // Fallback: sem PDF, manda só a mensagem com os botões.
          await sendTelegramMessage({ text: caption, inlineKeyboard });
        }
      } catch (e) {
        console.warn("[submeter-aprovacao] Telegram notify falhou (não bloqueia):", e);
        try { await sendTelegramMessage({ text: caption, inlineKeyboard }); } catch { /* best-effort */ }
      }
    }

    return NextResponse.json({ ok: true, semAprovador: !aprovador });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
