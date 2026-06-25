export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { aprovadorPedidoCompras } from "@/lib/aprovacao-cotacao";
import { notificarUsuario, marcarNotificacoesLidasPorLink } from "@/lib/notificacoes";
import { sendTelegramMessage, sendTelegramDocument, sendTelegramDM, escMD } from "@/lib/telegram";
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
          solicitadoPor: auth.session.sub,
        },
      });
      return ap.id;
    });

    // Notificação in-app (toast) para o aprovador.
    if (aprovacaoId && aprovador) {
      // Evita acúmulo: marca como lida qualquer pendência anterior desta cotação
      // antes de criar a nova (re-submissão não empilha "aguardando aprovação").
      await marcarNotificacoesLidasPorLink(aprovador.aprovadorId, `/suprimentos/cotacoes/${params.id}`, "COTACAO_APROVACAO_SOLICITADA");
      await notificarUsuario({
        usuarioId: aprovador.aprovadorId,
        tipo: "COTACAO_APROVACAO_SOLICITADA",
        titulo: "Cotação aguardando aprovação",
        mensagem: `A cotação ${numeroRef} foi enviada para sua aprovação.`,
        link: `/suprimentos/cotacoes/${params.id}`,
      });
    }

    // Notificação remota com botões inline (best-effort). A mensagem vai na
    // conversa DIRETA com o aprovador (DM), não no grupo — assim só ele decide e
    // a mensagem pode ser editada ao aprovar (novo status, sem botões). Sem DM
    // configurada (Colaborador.telegramChatId), cai no chat padrão do grupo.
    if (aprovacaoId && aprovador) {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
        ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
      const inlineKeyboard = [
        [
          { text: "✅ Aprovar", callbackData: `sc_APPROVE_${aprovacaoId}` },
          { text: "❌ Reprovar", callbackData: `sc_REJECT_${aprovacaoId}` },
        ],
        [{ text: "📋 Abrir cotação", url: `${baseUrl}/suprimentos/cotacoes/${params.id}` }],
      ];
      const texto = [
        `🧾 *Cotação aguardando sua aprovação*`,
        ``,
        `• *Cotação:* ${escMD(numeroRef)}`,
        ``,
        `Aprovar gera o Pedido de Compras\\.`,
      ].join("\n");

      // DM do aprovador (colaborador vinculado ao usuário aprovador).
      const colab = await prisma.colaborador.findFirst({
        where: { usuarioId: aprovador.aprovadorId },
        select: { telegramChatId: true },
      });
      const dmChatId = colab?.telegramChatId ?? null;

      try {
        if (dmChatId) {
          // Mensagem de texto editável + botões na DM; guarda chat/msg p/ editar
          // ao aprovar/reprovar. PDF vai como anexo separado (sem botões).
          const enviado = await sendTelegramDM(dmChatId, { text: texto, inlineKeyboard });
          if (enviado.ok && enviado.msgId) {
            await prisma.aprovacaoSC.update({
              where: { id: aprovacaoId },
              data: { telegramChatId: dmChatId, telegramMsgId: enviado.msgId },
            });
          }
          const pdf = await buildCotacaoPDF(params.id).catch(() => null);
          if (pdf) await sendTelegramDocument({ chatId: dmChatId, filename: pdf.filename, buffer: pdf.buffer, caption: `Resumo — ${escMD(numeroRef)}` });
        } else {
          // Sem DM: fallback no grupo (não editável depois, mas notifica).
          const pdf = await buildCotacaoPDF(params.id).catch(() => null);
          const enviado = pdf
            ? await sendTelegramDocument({ filename: pdf.filename, buffer: pdf.buffer, caption: texto, inlineKeyboard })
            : { ok: false as const };
          if (!enviado.ok) await sendTelegramMessage({ text: texto, inlineKeyboard });
        }
      } catch (e) {
        console.warn("[submeter-aprovacao] Telegram notify falhou (não bloqueia):", e);
      }
    }

    return NextResponse.json({ ok: true, semAprovador: !aprovador });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
