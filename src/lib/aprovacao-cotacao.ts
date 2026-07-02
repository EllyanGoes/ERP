import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateSimpleDocNumber } from "@/lib/utils";
import { proximaSequenciaDaEmpresa } from "@/lib/empresa";
import { editTelegramMessage, escMD } from "@/lib/telegram";

// ─────────────────────────────────────────────────────────────────────────────
// Aprovação da COTAÇÃO → geração do Pedido de Compras.
//
// A aprovação de compras deixou de ser na Solicitação (SC) e passou para a
// cotação: o gerente avalia a cotação e aprova, o que gera o Pedido de Compras
// (uma única aprovação). O aprovador é configurável pelo fluxo de aprovação do
// processo PEDIDO_COMPRAS (1ª etapa); ADMIN sempre pode.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aprovador configurado para PEDIDO_COMPRAS (1ª etapa do fluxo ativo).
 * Retorna o usuário aprovador (resolvendo colaborador→usuário) e o fluxo, ou
 * null se não houver fluxo/aprovador configurado.
 */
export async function aprovadorPedidoCompras(): Promise<
  { aprovadorId: string; fluxoId: string; etapaNome: string | null } | null
> {
  const fluxo = await prisma.aprovacaoFluxo.findFirst({
    where: { processo: "PEDIDO_COMPRAS", ativo: true },
    include: {
      etapas: {
        orderBy: { ordem: "asc" },
        include: { colaborador: { select: { usuarioId: true } } },
      },
    },
  });
  if (!fluxo) return null;
  const etapa = fluxo.etapas[0];
  if (!etapa) return null;
  const aprovadorId = etapa.colaborador?.usuarioId ?? etapa.aprovadorId ?? null;
  if (!aprovadorId) return null;
  return { aprovadorId, fluxoId: fluxo.id, etapaNome: etapa.nome ?? null };
}

/**
 * Gera o Pedido de Compras a partir da cotação (fornecedor vencedor), marca a
 * cotação como CONCLUIDA e move a SC para EM_PEDIDO. Idempotência: lança se já
 * houver PC ativo para a mesma SC. Deve rodar dentro de uma transação.
 */
export async function gerarPedidoDeCotacao(
  tx: Prisma.TransactionClient,
  cotacaoId: string,
  cfId?: string,
) {
  const cotacao = await tx.cotacaoCompra.findUnique({
    where: { id: cotacaoId },
    include: {
      fornecedores: { include: { fornecedor: true, itens: { include: { item: true } } } },
    },
  });
  if (!cotacao) throw new Error("Cotação não encontrada");
  if (cotacao.status === "CONCLUIDA") throw new Error("Cotação já concluída");

  // Impedir mais de um PC ativo para a mesma SC.
  if (cotacao.necessidadeId) {
    const existingPC = await tx.pedidoCompra.findFirst({
      where: { cotacao: { necessidadeId: cotacao.necessidadeId }, status: { not: "CANCELADO" } },
      select: { numero: true },
    });
    if (existingPC) {
      throw new Error(
        `Já existe o Pedido de Compra ${existingPC.numero} ativo para esta Solicitação. Cancele-o antes de aprovar uma nova cotação.`,
      );
    }
  } else {
    // Cotação AVULSA (sem SC): impede um 2º PC ativo gerado da MESMA cotação
    // (corrida de aprovação dupla — dois canais aprovando ao mesmo tempo).
    const existingPC = await tx.pedidoCompra.findFirst({
      where: { cotacaoId, status: { not: "CANCELADO" } },
      select: { numero: true },
    });
    if (existingPC) {
      throw new Error(
        `Já existe o Pedido de Compra ${existingPC.numero} ativo para esta cotação. Cancele-o antes de aprovar novamente.`,
      );
    }
  }

  // Fornecedor vencedor: cfId explícito → melhorOpcao → menor total respondido.
  let melhor = cfId
    ? cotacao.fornecedores.find((f) => f.id === cfId)
    : cotacao.fornecedores.find((f) => f.melhorOpcao);
  if (!melhor) {
    const respondidas = cotacao.fornecedores
      .filter((f) => f.status === "RESPONDIDA" && f.totalCalculado != null)
      .sort((a, b) => parseFloat(String(a.totalCalculado)) - parseFloat(String(b.totalCalculado)));
    melhor = respondidas[0];
  }
  if (!melhor) throw new Error("Nenhum fornecedor com proposta respondida");

  await tx.cotacaoFornecedor.updateMany({ where: { cotacaoId }, data: { melhorOpcao: false } });
  await tx.cotacaoFornecedor.update({ where: { id: melhor.id }, data: { melhorOpcao: true } });

  const numero = generateSimpleDocNumber(
    "PC",
    await proximaSequenciaDaEmpresa(cotacao.empresaId, "PC"),
  );

  const itensComPreco = melhor.itens.filter((i) => i.precoUnitario != null);
  const parsedItens = itensComPreco.map((i) => {
    const qtd = parseFloat(String(i.quantidade ?? 0));
    const preco = parseFloat(String(i.precoUnitario ?? 0));
    const sub = parseFloat(String(i.subtotal ?? 0));
    const vlTotal = sub > 0 ? sub : qtd * preco;
    return { itemId: i.itemId, quantidade: qtd, precoUnitario: preco, valorTotal: vlTotal };
  });
  const valorTotal = parsedItens.reduce((sum, i) => sum + i.valorTotal, 0);

  const pedidoCompra = await tx.pedidoCompra.create({
    data: {
      numero,
      empresaId: cotacao.empresaId,
      cotacaoId: cotacao.id,
      fornecedorId: melhor.fornecedorId,
      valorTotal,
      itens: { create: parsedItens },
    },
    include: {
      fornecedor: { select: { id: true, razaoSocial: true } },
      itens: { include: { item: { select: { id: true, codigo: true, descricao: true } } } },
    },
  });

  const updatedCotacao = await tx.cotacaoCompra.update({
    where: { id: cotacaoId },
    data: { status: "CONCLUIDA", dataAprovacao: new Date(), fornecedorVencedorId: melhor.fornecedorId },
  });

  // SC → EM_PEDIDO (o "atendida" só é definido no recebimento).
  if (cotacao.necessidadeId) {
    await tx.necessidadeCompra.updateMany({
      where: { id: cotacao.necessidadeId, status: { in: ["EM_COTACAO", "APROVADA", "AGUARDANDO_APROVACAO", "RASCUNHO"] } },
      data: { status: "EM_PEDIDO" },
    });
  }

  return { cotacao: updatedCotacao, pedidoCompra };
}

/**
 * Edita a mensagem do Telegram (DM ao aprovador) enviada no submeter-aprovação,
 * trocando para o status final e removendo os botões de ação. Best-effort —
 * só edita se a pendência guardou chat/mensagem. Chamado pelos dois canais de
 * aprovação (botão do Telegram via webhook e tela web).
 */
export async function finalizarMensagemAprovacaoCotacao(
  aprovacaoId: string,
  status: "APROVADO" | "REPROVADO",
  aprovadorNome: string,
  pedidoNumero?: string | null,
): Promise<void> {
  try {
    const ap = await prisma.aprovacaoSC.findUnique({
      where: { id: aprovacaoId },
      select: {
        telegramChatId: true,
        telegramMsgId: true,
        cotacao: { select: { numero: true, nome: true, necessidade: { select: { numero: true } } } },
      },
    });
    if (!ap?.telegramChatId || !ap.telegramMsgId) return;

    const ref = ap.cotacao?.nome || ap.cotacao?.necessidade?.numero || ap.cotacao?.numero || "Cotação";
    const aprovado = status === "APROVADO";
    const icon = aprovado ? "✅" : "❌";
    const linhas = [
      `${icon} *Cotação ${aprovado ? "aprovada" : "reprovada"}*`,
      ``,
      `• *Cotação:* ${escMD(ref)}`,
      `• *${aprovado ? "Aprovada" : "Reprovada"} por:* ${escMD(aprovadorNome)}`,
      ...(aprovado && pedidoNumero ? [`• *Pedido de Compras:* ${escMD(pedidoNumero)}`] : []),
    ];
    await editTelegramMessage(ap.telegramChatId, ap.telegramMsgId, linhas.join("\n"));
  } catch (e) {
    console.warn("[finalizarMensagemAprovacaoCotacao] falhou (não bloqueia):", e);
  }
}
