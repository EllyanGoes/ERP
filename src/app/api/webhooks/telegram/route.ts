export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { answerCallbackQuery, escMD, sendTelegramDM, sendTelegramDocument } from "@/lib/telegram";
import { buildRelatorioEstoque, parseRelatorioDate } from "@/lib/relatorio-estoque";
import { buildRelatorioNecessidades } from "@/lib/relatorio-necessidades";
import { buildRelatorioSolicitacoes } from "@/lib/relatorio-solicitacoes";
import { buildRelatorioConsumo } from "@/lib/relatorio-consumo";
import { gerarPedidoDeCotacao, finalizarMensagemAprovacaoCotacao } from "@/lib/aprovacao-cotacao";
import { gerarContasPagarAntecipadoDoPedido } from "@/lib/contas-pagar";
import { notificarUsuario, marcarNotificacoesLidasPorLink } from "@/lib/notificacoes";

// Telegram sends POST with callback_query when user clicks inline keyboard button
export async function POST(req: NextRequest) {
  try {
    // Fail-closed: sem TG_WEBHOOK_SECRET configurado, recusa tudo. O segredo é
    // registrado junto ao webhook em Configurações → Integrações → Telegram
    // ("Registrar webhook"), que envia secret_token ao Telegram.
    const secretToken = req.headers.get("x-telegram-bot-api-secret-token");
    const expectedSecret = process.env.TG_WEBHOOK_SECRET;
    if (!expectedSecret || secretToken !== expectedSecret) {
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
        cotacao: { select: { id: true } },
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

    // ── Autorização: só o APROVADOR designado pode clicar ─────────────────────
    // O secret do webhook autentica o TELEGRAM, não o usuário — qualquer pessoa
    // com acesso à mensagem (grupo/encaminhada) conseguiria clicar. Valida que o
    // `from.id` do clique é o chat do aprovador: o registrado na pendência
    // (DM enviada) ou o Colaborador.telegramChatId vinculado ao usuário aprovador.
    // Fail-closed: sem chat configurado, o clique é recusado (aprove pela web).
    {
      const colabAprovador = await prisma.colaborador.findFirst({
        where: { usuarioId: aprovacao.aprovadorId },
        select: { telegramChatId: true },
      });
      const chatsPermitidos = [
        aprovacao.telegramChatId,
        colabAprovador?.telegramChatId,
      ].filter((c): c is string => Boolean(c));
      if (!chatsPermitidos.includes(String(cq.from.id))) {
        await answerCallbackQuery(cq.id, "Sem permissão");
        return NextResponse.json({ ok: true });
      }
    }

    const novoStatus = acao === "APROVAR" ? "APROVADO" : "REPROVADO";

    // ── Aprovação de COTAÇÃO → gera o Pedido de Compras ───────────────────────
    if (aprovacao.cotacaoId) {
      const cotacaoId = aprovacao.cotacaoId;
      let novoPedidoNumero: string | null = null;
      try {
        if (novoStatus === "REPROVADO") {
          // Claim atômico: só quem virar a pendência PENDENTE→REPROVADO processa
          // (cliques duplos/concorrentes não reprovam duas vezes).
          await prisma.$transaction(async (tx) => {
            const claim = await tx.aprovacaoSC.updateMany({
              where: { id: aprovacaoId, status: "PENDENTE" },
              data: { status: "REPROVADO", respondidoEm: new Date() },
            });
            if (claim.count === 0) throw new Error("Esta aprovação já foi respondida");
            await tx.cotacaoCompra.update({
              where: { id: cotacaoId },
              data: { status: "EM_ANALISE", motivoReprovacao: `Reprovado por ${aprovacao.aprovador.nome} via Telegram` },
            });
          });
        } else {
          // Claim atômico como 1º statement DENTRO da mesma transação que gera o
          // pedido: dois cliques concorrentes não geram dois PCs — o segundo vê
          // a pendência já baixada (count 0) e aborta com rollback.
          const out = await prisma.$transaction(async (tx) => {
            const claim = await tx.aprovacaoSC.updateMany({
              where: { id: aprovacaoId, status: "PENDENTE" },
              data: { status: "APROVADO", respondidoEm: new Date() },
            });
            if (claim.count === 0) throw new Error("Esta aprovação já foi respondida");
            return gerarPedidoDeCotacao(tx, cotacaoId);
          });
          novoPedidoNumero = out.pedidoCompra.numero;
          // PA: título antecipado nasce já no pedido (best-effort, no-op se não for PA).
          await gerarContasPagarAntecipadoDoPedido(out.pedidoCompra.id).catch((e) => {
            console.error("[telegram webhook] gerarContasPagarAntecipadoDoPedido falhou:", e);
          });
        }
      } catch (e) {
        await answerCallbackQuery(cq.id, e instanceof Error ? e.message.slice(0, 180) : "Erro ao aprovar cotação");
        return NextResponse.json({ ok: true });
      }
      await answerCallbackQuery(cq.id, novoStatus === "APROVADO" ? "✅ Cotação aprovada — pedido gerado" : "❌ Cotação reprovada");
      // Atualiza a mensagem do aprovador (novo status, sem botões).
      await finalizarMensagemAprovacaoCotacao(aprovacaoId, novoStatus, aprovacao.aprovador.nome, novoPedidoNumero);

      // Sincroniza as notificações in-app (mesmo comportamento do canal in-app):
      const link = `/suprimentos/cotacoes/${cotacaoId}`;
      // 1) Tira do "não lidas" do aprovador a pendência desta cotação (não acumula).
      if (aprovacao.aprovadorId) {
        await marcarNotificacoesLidasPorLink(aprovacao.aprovadorId, link, "COTACAO_APROVACAO_SOLICITADA").catch(() => {});
      }
      // 2) Notifica o solicitante in-app (aprovada/reprovada).
      if (aprovacao.solicitadoPor) {
        const cot = await prisma.cotacaoCompra.findUnique({ where: { id: cotacaoId }, select: { nome: true, numero: true } });
        const ref = cot?.nome || cot?.numero || "";
        if (novoStatus === "APROVADO") {
          await notificarUsuario({
            usuarioId: aprovacao.solicitadoPor, tipo: "COTACAO_APROVADA", titulo: "Cotação aprovada",
            mensagem: `Sua cotação ${ref} foi aprovada — Pedido ${novoPedidoNumero} gerado.`, link,
          }).catch(() => {});
        } else {
          await notificarUsuario({
            usuarioId: aprovacao.solicitadoPor, tipo: "COTACAO_REPROVADA", titulo: "Cotação reprovada",
            mensagem: `Sua cotação ${ref} foi reprovada.`, link,
          }).catch(() => {});
        }
      }
      return NextResponse.json({ ok: true });
    }

    // ── Aprovação legada de SC (descontinuada) ────────────────────────────────
    // A aprovação de compras migrou da Solicitação para a COTAÇÃO (cotacaoId).
    // Pendências antigas de SC não são mais processadas por aqui.
    await answerCallbackQuery(cq.id, "Aprovação de SC foi descontinuada — a aprovação agora é na cotação.");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/webhooks/telegram]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
