// Re-aprovação do Pedido de Compras (decisão do dono, out/2026): o pedido
// aprovado nasce em AGUARDANDO_PAGAMENTO; se for EDITADO depois disso (novos
// itens, preço, encargos…), volta para AGUARDANDO_APROVACAO e o mesmo aprovador
// do fluxo PEDIDO_COMPRAS decide de novo — pela tela Aprovações, pelo Telegram
// ou direto no pedido (ADMIN/aprovador). Aprovar → AGUARDANDO_PAGAMENTO;
// reprovar → RASCUNHO (fica editável, com o motivo na notificação).
import { prisma } from "@/lib/prisma";
import { aprovadorPedidoCompras } from "@/lib/aprovacao-cotacao";
import { notificarUsuario, marcarNotificacoesLidasPorLink } from "@/lib/notificacoes";
import { sendTelegramDM, sendTelegramMessage, editTelegramMessage, escMD } from "@/lib/telegram";

/** Status em que o pedido ainda pode ser editado (RECEBIDO/CANCELADO não). */
export const STATUS_PEDIDO_EDITAVEL = ["RASCUNHO", "ENVIADO", "AGUARDANDO_APROVACAO", "AGUARDANDO_PAGAMENTO", "EM_TRANSITO", "CONFIRMADO"] as const;
/** Status em que a edição exige nova aprovação (o pedido já tinha sido aprovado). */
export const STATUS_PEDIDO_APROVADO = ["AGUARDANDO_PAGAMENTO", "EM_TRANSITO", "CONFIRMADO", "AGUARDANDO_APROVACAO"] as const;

const linkPedido = (id: string) => `/suprimentos/pedidos-compra/${id}`;

/**
 * Pedido editado após aprovado: vira AGUARDANDO_APROVACAO, substitui a
 * pendência anterior e avisa o aprovador (in-app + Telegram com botões).
 * Sem aprovador configurado, fica aguardando e só ADMIN aprova no pedido.
 */
export async function submeterPedidoParaAprovacao(pedidoId: string, solicitadoPor: string): Promise<{ aprovacaoId: string | null; semAprovador: boolean }> {
  const pedido = await prisma.pedidoCompra.findUnique({
    where: { id: pedidoId },
    select: { id: true, numero: true, valorTotal: true, fornecedor: { select: { razaoSocial: true, nomeFantasia: true } } },
  });
  if (!pedido) throw new Error("Pedido não encontrado");
  const aprovador = await aprovadorPedidoCompras();

  const aprovacaoId = await prisma.$transaction(async (tx) => {
    await tx.pedidoCompra.update({ where: { id: pedidoId }, data: { status: "AGUARDANDO_APROVACAO" } });
    await tx.aprovacaoSC.deleteMany({ where: { pedidoCompraId: pedidoId, status: "PENDENTE" } });
    if (!aprovador) return null;
    const ap = await tx.aprovacaoSC.create({
      data: {
        pedidoCompraId: pedidoId,
        etapaOrdem: 1,
        etapaNome: aprovador.etapaNome,
        aprovadorId: aprovador.aprovadorId,
        fluxoId: aprovador.fluxoId,
        status: "PENDENTE",
        solicitadoPor,
      },
    });
    return ap.id;
  });

  if (aprovacaoId && aprovador) {
    const forn = pedido.fornecedor.nomeFantasia || pedido.fornecedor.razaoSocial;
    const total = Number(pedido.valorTotal).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    await marcarNotificacoesLidasPorLink(aprovador.aprovadorId, linkPedido(pedidoId), "PEDIDO_APROVACAO_SOLICITADA").catch(() => {});
    await notificarUsuario({
      usuarioId: aprovador.aprovadorId,
      tipo: "PEDIDO_APROVACAO_SOLICITADA",
      titulo: "Pedido de compras editado aguarda aprovação",
      mensagem: `O pedido ${pedido.numero} (${forn}, ${total}) foi alterado e precisa ser aprovado de novo.`,
      link: linkPedido(pedidoId),
    }).catch(() => {});

    // Telegram (best-effort): DM do aprovador com botões; sem DM, grupo.
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
        ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
      const inlineKeyboard = [
        [
          { text: "✅ Aprovar", callbackData: `sc_APPROVE_${aprovacaoId}` },
          { text: "❌ Reprovar", callbackData: `sc_REJECT_${aprovacaoId}` },
        ],
        [{ text: "📋 Abrir pedido", url: `${baseUrl}${linkPedido(pedidoId)}` }],
      ];
      const texto = [
        `🧾 *Pedido de Compras alterado — aguarda sua aprovação*`,
        ``,
        `• *Pedido:* ${escMD(pedido.numero)}`,
        `• *Fornecedor:* ${escMD(forn)}`,
        `• *Total:* ${escMD(total)}`,
        ``,
        `Aprovar devolve o pedido para Aguardando Pagamento\.`,
      ].join("\n");
      const colab = await prisma.colaborador.findFirst({ where: { usuarioId: aprovador.aprovadorId }, select: { telegramChatId: true } });
      if (colab?.telegramChatId) {
        const enviado = await sendTelegramDM(colab.telegramChatId, { text: texto, inlineKeyboard });
        if (enviado.ok && enviado.msgId) {
          await prisma.aprovacaoSC.update({ where: { id: aprovacaoId }, data: { telegramChatId: colab.telegramChatId, telegramMsgId: enviado.msgId } });
        }
      } else {
        await sendTelegramMessage({ text: texto, inlineKeyboard });
      }
    } catch (e) {
      console.warn("[submeterPedidoParaAprovacao] Telegram falhou (não bloqueia):", e);
    }
  }
  return { aprovacaoId, semAprovador: !aprovador };
}

/**
 * Decide a re-aprovação do pedido. Com `aprovacaoId` faz o claim atômico da
 * pendência (web, Telegram, bulk); sem pendência (nenhum aprovador configurado)
 * só ADMIN decide direto no pedido.
 */
export async function responderAprovacaoPedido(opts: {
  pedidoId: string;
  aprovacaoId?: string | null;
  acao: "APROVAR" | "REPROVAR";
  observacao?: string | null;
  respondente: { id: string; nome: string; perfil: string };
}): Promise<{ status: "APROVADO" | "REPROVADO"; pedidoNumero: string }> {
  const { pedidoId, acao, observacao, respondente } = opts;
  const pedido = await prisma.pedidoCompra.findUnique({ where: { id: pedidoId }, select: { id: true, numero: true, status: true } });
  if (!pedido) throw new Error("Pedido não encontrado");
  if (pedido.status !== "AGUARDANDO_APROVACAO") throw new Error("O pedido não está aguardando aprovação.");

  const pendente = opts.aprovacaoId
    ? await prisma.aprovacaoSC.findUnique({ where: { id: opts.aprovacaoId }, include: { aprovador: { select: { nome: true } } } })
    : await prisma.aprovacaoSC.findFirst({ where: { pedidoCompraId: pedidoId, status: "PENDENTE" }, include: { aprovador: { select: { nome: true } } } });
  if (pendente && pendente.pedidoCompraId !== pedidoId) throw new Error("Aprovação não pertence a este pedido.");
  const ehAprovador = pendente?.aprovadorId === respondente.id;
  if (!ehAprovador && respondente.perfil !== "ADMIN") throw new Error("Só o aprovador designado (ou um administrador) pode decidir.");
  if (pendente && pendente.status !== "PENDENTE") throw new Error("Esta aprovação já foi respondida");

  const novoStatus = acao === "APROVAR" ? "APROVADO" : "REPROVADO";
  await prisma.$transaction(async (tx) => {
    if (pendente) {
      const claim = await tx.aprovacaoSC.updateMany({
        where: { id: pendente.id, status: "PENDENTE" },
        data: { status: novoStatus, observacao: observacao ?? null, respondidoEm: new Date() },
      });
      if (claim.count === 0) throw new Error("Esta aprovação já foi respondida");
    }
    await tx.pedidoCompra.update({
      where: { id: pedidoId },
      data: { status: novoStatus === "APROVADO" ? "AGUARDANDO_PAGAMENTO" : "RASCUNHO" },
    });
  });

  // Telegram: edita a mensagem do aprovador (novo status, sem botões) — best-effort.
  if (pendente?.telegramChatId && pendente.telegramMsgId) {
    const aprovado = novoStatus === "APROVADO";
    const linhas = [
      `${aprovado ? "✅" : "❌"} *Pedido ${aprovado ? "aprovado" : "reprovado"}*`,
      ``,
      `• *Pedido:* ${escMD(pedido.numero)}`,
      `• *${aprovado ? "Aprovado" : "Reprovado"} por:* ${escMD(respondente.nome)}`,
      ...(observacao ? [`• *Motivo:* ${escMD(observacao)}`] : []),
    ];
    await editTelegramMessage(pendente.telegramChatId, pendente.telegramMsgId, linhas.join("\n")).catch(() => {});
  }
  // Notificações in-app: baixa a do aprovador, avisa quem editou.
  if (pendente?.aprovadorId) {
    await marcarNotificacoesLidasPorLink(pendente.aprovadorId, linkPedido(pedidoId), "PEDIDO_APROVACAO_SOLICITADA").catch(() => {});
  }
  if (pendente?.solicitadoPor) {
    await notificarUsuario({
      usuarioId: pendente.solicitadoPor,
      tipo: novoStatus === "APROVADO" ? "PEDIDO_APROVADO" : "PEDIDO_REPROVADO",
      titulo: novoStatus === "APROVADO" ? "Pedido de compras aprovado" : "Pedido de compras reprovado",
      mensagem: novoStatus === "APROVADO"
        ? `O pedido ${pedido.numero} foi aprovado e voltou para Aguardando Pagamento.`
        : `O pedido ${pedido.numero} foi reprovado${observacao ? `: ${observacao}` : "."} Ele voltou para rascunho.`,
      link: linkPedido(pedidoId),
    }).catch(() => {});
  }
  return { status: novoStatus, pedidoNumero: pedido.numero };
}
