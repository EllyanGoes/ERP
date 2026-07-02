import { Prisma } from "@prisma/client";
import { prismaSemEscopo } from "@/lib/prisma";
import { proximaSequenciaDaEmpresa } from "@/lib/empresa";
import { generateDocNumber, decimalToNumber } from "@/lib/utils";
import { detalheItens } from "@/lib/detalhe-itens";
import { calcularParcelas, type CondicaoParcelas } from "@/lib/parcelas";
import { recomputarStatusPedido } from "@/lib/pedido-totais";

export type { CondicaoParcelas };

/**
 * Gera as contas a receber de um pedido conforme a CONDIÇÃO DE PAGAMENTO
 * (à vista / a prazo / parcelado / sem vencimento). Todos nascem ABERTA. Não
 * cria nada se valorTotal ≤ 0 (ou já houver título — guarda no chamador).
 */
export async function gerarContasReceberDoPedido(
  tx: Prisma.TransactionClient,
  pedido: {
    id: string; empresaId: string; clienteId: string; numero: string;
    valorTotal: unknown; dataEmissao: Date | string; naturezaFinanceiraId?: string | null;
  },
  condicao: CondicaoParcelas,
): Promise<number> {
  // Detalhe dos itens do pedido na descrição (como no razão).
  const itensPv = await tx.pedidoVendaItem.findMany({
    where: { pedidoVendaId: pedido.id },
    select: { quantidade: true, precoUnitario: true, item: { select: { descricao: true } } },
  });
  const det = detalheItens(itensPv);
  const baseDesc = `Faturamento pedido ${pedido.numero}${det ? ` — ${det}` : ""}`;

  const parcelas = calcularParcelas(condicao, pedido.valorTotal, pedido.dataEmissao);
  for (const p of parcelas) {
    const numero = generateDocNumber("CR", await proximaSequenciaDaEmpresa(pedido.empresaId, "CR"));
    await tx.contaReceber.create({
      data: {
        empresaId: pedido.empresaId,
        numero,
        clienteId: pedido.clienteId,
        pedidoVendaId: pedido.id,
        naturezaFinanceiraId: pedido.naturezaFinanceiraId ?? null,
        descricao: p.parcelaTotal ? `${baseDesc} (${p.parcelaNumero}/${p.parcelaTotal})` : baseDesc,
        valorOriginal: p.valor,
        dataVencimento: p.dataVencimento,
        status: "ABERTA",
        ...(p.grupoParcelamentoId ? { grupoParcelamentoId: p.grupoParcelamentoId, parcelaNumero: p.parcelaNumero, parcelaTotal: p.parcelaTotal } : {}),
      },
    });
  }
  return parcelas.length;
}

/**
 * Fatura o pedido na ENTREGA/RETIRADA TOTAL (decisão jul/2026: o contas a receber
 * nasce quando a obrigação de entregar foi cumprida, não na confirmação do
 * pedido). Idempotente e à prova de corrida: um lock de linha no pedido (FOR
 * UPDATE) serializa gatilhos concorrentes (minuta ENTREGUE × status × balcão) e a
 * recontagem de CRs dentro da transação decide. O balcão (entrega imediata com
 * recebimento) cria o título no próprio fluxo — a recontagem aqui não duplica.
 * Pula intragrupo, orçamento/cancelado e pedido sem valor. Retorna true se gerou.
 */
export async function faturarPedidoSeEntregue(pedidoVendaId: string): Promise<boolean> {
  const pedido = await prismaSemEscopo.pedidoVenda.findUnique({
    where: { id: pedidoVendaId },
    select: {
      id: true, empresaId: true, clienteId: true, numero: true, status: true, intragrupo: true,
      valorTotal: true, dataEmissao: true, naturezaFinanceiraId: true,
      condicaoPagamentoId: true, condicaoPagamento: true,
      itens: {
        select: {
          quantidade: true,
          minutaItens: { where: { minuta: { status: "ENTREGUE" } }, select: { quantidade: true } },
        },
      },
    },
  });
  if (!pedido || pedido.intragrupo) return false;
  if (!["CONFIRMADO", "EM_AGENDAMENTO", "CONCLUIDO"].includes(pedido.status)) return false;
  if (decimalToNumber(pedido.valorTotal) <= 0) return false;

  // Só fatura com a ENTREGA TOTAL (mesma definição do recomputarStatusPedido).
  const tudoEntregue = pedido.itens.length > 0 && pedido.itens.every((it) => {
    const entregue = it.minutaItens.reduce((s, mi) => s + decimalToNumber(mi.quantidade), 0);
    return entregue >= decimalToNumber(it.quantidade) - 0.0001;
  });
  if (!tudoEntregue) return false;

  const condicao = pedido.condicaoPagamentoId
    ? await prismaSemEscopo.condicaoPagamento.findUnique({ where: { id: pedido.condicaoPagamentoId } })
    : (pedido.condicaoPagamento
      ? await prismaSemEscopo.condicaoPagamento.findFirst({ where: { nome: pedido.condicaoPagamento } })
      : null);

  let gerou = false;
  await prismaSemEscopo.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "PedidoVenda" WHERE id = ${pedidoVendaId} FOR UPDATE`;
    const jaTem = await tx.contaReceber.count({ where: { pedidoVendaId, status: { not: "CANCELADA" } } });
    if (jaTem > 0) return;
    await gerarContasReceberDoPedido(tx, pedido, condicao);
    await recomputarStatusPedido(tx, pedidoVendaId);
    gerou = true;
  });
  return gerou;
}
