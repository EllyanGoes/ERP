export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { answerCallbackQuery, editTelegramMessage, escMD, sendTelegramDM, sendTelegramDocument } from "@/lib/telegram";
import { buildRelatorioEstoque, parseRelatorioDate } from "@/lib/relatorio-estoque";
import { buildRelatorioNecessidades } from "@/lib/relatorio-necessidades";
import { buildRelatorioSolicitacoes } from "@/lib/relatorio-solicitacoes";
import { buildRelatorioConsumo } from "@/lib/relatorio-consumo";

// Telegram sends POST with callback_query when user clicks inline keyboard button
export async function POST(req: NextRequest) {
  try {
    // Optional: verify secret token
    const secretToken = req.headers.get("x-telegram-bot-api-secret-token");
    const expectedSecret = process.env.TG_WEBHOOK_SECRET;
    if (expectedSecret && secretToken !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json() as {
      callback_query?: {
        id: string;
        from: { id: number; first_name?: string; username?: string };
        message?: { message_id: number; chat: { id: number } };
        data?: string;
      };
      message?: {
        message_id: number;
        from?: { id: number; first_name?: string; username?: string };
        chat: { id: number; type: string };
        text?: string;
      };
    };

    // ── Handle text commands ──────────────────────────────────────────────────
    if (body.message?.text != null) {
      const msg  = body.message;
      const text = (msg.text ?? "").trim();

      // /relatorio [data opcional]
      if (text.startsWith("/relatorio")) {
        const arg        = text.replace(/^\/relatorio(@\S+)?/, "").trim();
        const targetDate = parseRelatorioDate(arg);

        if (!targetDate) {
          await sendTelegramDM(msg.chat.id, {
            text: `❌ Data inválida: *${escMD(arg)}*\n\nUse: /relatorio, /relatorio hoje, /relatorio ontem, ou /relatorio DD\\/MM\\/AAAA`,
          });
          return NextResponse.json({ ok: true });
        }

        await sendTelegramDM(msg.chat.id, { text: `⏳ _Gerando relatório\\.\\.\\._` });

        try {
          const relatorio = await buildRelatorioEstoque(targetDate);
          const dateStr   = targetDate.toLocaleDateString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            day: "2-digit", month: "2-digit", year: "numeric",
          }).replace(/\//g, "-");

          await sendTelegramDocument({
            chatId:   String(msg.chat.id),
            filename: `estoque-${dateStr}.pdf`,
            buffer:   relatorio.pdfBuffer,
            caption:  relatorio.captionText,
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await sendTelegramDM(msg.chat.id, {
            text: `❌ Erro ao gerar relatório: ${escMD(errMsg)}`,
          });
        }

        return NextResponse.json({ ok: true });
      }

      // /necessidades — relatório de necessidades pendentes de cotação
      if (text.startsWith("/necessidades")) {
        await sendTelegramDM(msg.chat.id, { text: `⏳ _Gerando relatório\\.\\.\\._` });

        try {
          const relatorio = await buildRelatorioNecessidades();
          const dateStr = new Date().toLocaleDateString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            day: "2-digit", month: "2-digit", year: "numeric",
          }).replace(/\//g, "-");

          await sendTelegramDocument({
            chatId:   String(msg.chat.id),
            filename: `necessidades-pendentes-${dateStr}.pdf`,
            buffer:   relatorio.pdfBuffer,
            caption:  relatorio.captionText,
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await sendTelegramDM(msg.chat.id, {
            text: `❌ Erro ao gerar relatório: ${escMD(errMsg)}`,
          });
        }

        return NextResponse.json({ ok: true });
      }

      // /solicitacoes — relatório de SCs ativas (exceto totalmente atendidas)
      if (text.startsWith("/solicitacoes")) {
        await sendTelegramDM(msg.chat.id, { text: `⏳ _Gerando relatório\\.\\.\\._` });

        try {
          const relatorio = await buildRelatorioSolicitacoes();
          const dateStr = new Date().toLocaleDateString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            day: "2-digit", month: "2-digit", year: "numeric",
          }).replace(/\//g, "-");

          await sendTelegramDocument({
            chatId:   String(msg.chat.id),
            filename: `solicitacoes-ativas-${dateStr}.pdf`,
            buffer:   relatorio.pdfBuffer,
            caption:  relatorio.captionText,
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await sendTelegramDM(msg.chat.id, {
            text: `❌ Erro ao gerar relatório: ${escMD(errMsg)}`,
          });
        }

        return NextResponse.json({ ok: true });
      }

      // /consumo — análise de consumo dos produtos favoritados
      if (text.startsWith("/consumo")) {
        await sendTelegramDM(msg.chat.id, { text: `⏳ _Gerando análise de consumo\\.\\.\\._` });

        try {
          const relatorio = await buildRelatorioConsumo();
          const dateStr = new Date().toLocaleDateString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            day: "2-digit", month: "2-digit", year: "numeric",
          }).replace(/\//g, "-");

          await sendTelegramDocument({
            chatId:   String(msg.chat.id),
            filename: `consumo-${dateStr}.pdf`,
            buffer:   relatorio.pdfBuffer,
            caption:  relatorio.captionText,
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await sendTelegramDM(msg.chat.id, {
            text: `❌ Erro ao gerar análise: ${escMD(errMsg)}`,
          });
        }

        return NextResponse.json({ ok: true });
      }

      // /ajuda — lista de comandos disponíveis
      if (text.startsWith("/ajuda") || text.startsWith("/help") || text.startsWith("/start")) {
        await sendTelegramDM(msg.chat.id, {
          text: [
            `ℹ️ *Comandos disponíveis*`,
            ``,
            `📦 /relatorio — Relatório de movimentações de estoque do dia`,
            `_Variações: /relatorio hoje, /relatorio ontem, /relatorio DD\\/MM\\/AAAA_`,
            ``,
            `📋 /necessidades — Necessidades pendentes de cotação`,
            `_SCs aprovadas que ainda não possuem cotação vinculada_`,
            ``,
            `📑 /solicitacoes — Solicitações de compras ativas`,
            `_Todas as SCs exceto as totalmente atendidas_`,
            ``,
            `📊 /consumo — Análise de consumo dos produtos favoritados`,
            `_Série histórica 90 dias \\+ projeção 14 dias_`,
            ``,
            `ℹ️ /ajuda — Lista de comandos disponíveis`,
          ].join("\n"),
        });
        return NextResponse.json({ ok: true });
      }

      // Unknown command — ignore silently
      return NextResponse.json({ ok: true });
    }

    const cq = body.callback_query;
    if (!cq) {
      // Not a callback query and not a message — acknowledge silently
      return NextResponse.json({ ok: true });
    }

    const data = cq.data ?? "";
    // Expected format: sc_APPROVE_{aprovacaoId} or sc_REJECT_{aprovacaoId}
    const match = data.match(/^sc_(APPROVE|REJECT)_(.+)$/);
    if (!match) {
      await answerCallbackQuery(cq.id, "Ação desconhecida");
      return NextResponse.json({ ok: true });
    }

    const acao        = match[1] === "APPROVE" ? "APROVAR" : "REPROVAR";
    const aprovacaoId = match[2];

    // Load the approval
    const aprovacao = await prisma.aprovacaoSC.findUnique({
      where: { id: aprovacaoId },
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
      },
    });

    if (!aprovacao) {
      await answerCallbackQuery(cq.id, "Aprovação não encontrada");
      return NextResponse.json({ ok: true });
    }

    if (aprovacao.status !== "PENDENTE") {
      await answerCallbackQuery(
        cq.id,
        `Esta aprovação já foi ${aprovacao.status === "APROVADO" ? "aprovada" : "reprovada"}`
      );
      return NextResponse.json({ ok: true });
    }

    const novoStatus = acao === "APROVAR" ? "APROVADO" : "REPROVADO";

    // Update approval
    await prisma.aprovacaoSC.update({
      where: { id: aprovacaoId },
      data: { status: novoStatus, respondidoEm: new Date() },
    });

    const sc = aprovacao.necessidade;

    if (novoStatus === "REPROVADO") {
      await prisma.necessidadeCompra.update({
        where: { id: sc.id },
        data: {
          status: "REJEITADA",
          motivoReprovacao: `Reprovado por ${aprovacao.aprovador.nome} via Telegram`,
        },
      });
    } else {
      // Check next stage
      const proxEtapa = await prisma.aprovacaoEtapa.findFirst({
        where: {
          ordem: { gt: aprovacao.etapaOrdem },
          ...(aprovacao.fluxoId ? { fluxoId: aprovacao.fluxoId } : { fluxo: { ativo: true } }),
        },
        include: { aprovador: true, colaborador: true },
        orderBy: { ordem: "asc" },
      });

      if (proxEtapa) {
        const proxColaborador = proxEtapa.colaborador;
        const proxAprovadorId = proxColaborador?.usuarioId ?? proxEtapa.aprovadorId ?? null;

        if (proxAprovadorId) {
          await prisma.aprovacaoSC.deleteMany({
            where: { necessidadeId: sc.id, aprovadorId: proxAprovadorId, status: "PENDENTE" },
          });
          await prisma.aprovacaoSC.create({
            data: {
              necessidadeId: sc.id,
              fluxoId:       aprovacao.fluxoId,
              etapaOrdem:    proxEtapa.ordem,
              etapaNome:     proxEtapa.nome ?? null,
              aprovadorId:   proxAprovadorId,
              status:        "PENDENTE",
            },
          });
        }
      } else {
        await prisma.necessidadeCompra.update({
          where: { id: sc.id },
          data: {
            status: "APROVADA",
            aprovadoPor:   aprovacao.aprovador.nome,
            dataAprovacao: new Date().toISOString(),
          },
        });
      }
    }

    // Answer the callback and edit the original message
    const icon = novoStatus === "APROVADO" ? "✅" : "❌";
    const verb = novoStatus === "APROVADO" ? "Aprovada" : "Reprovada";
    await answerCallbackQuery(cq.id, `${icon} SC ${verb}`);

    if (cq.message) {
      const updatedText = [
        `${icon} *SC Nº ${escMD(sc.numero)} — ${verb}*`,
        ``,
        `Decisão de: ${escMD(aprovacao.aprovador.nome)}`,
      ].join("\n");

      await editTelegramMessage(cq.message.chat.id, cq.message.message_id, updatedText);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/webhooks/telegram]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
