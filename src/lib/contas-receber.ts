import { Prisma } from "@prisma/client";
import { prismaSemEscopo } from "@/lib/prisma";
import { proximaSequenciaDaEmpresa } from "@/lib/empresa";
import { generateDocNumber, decimalToNumber } from "@/lib/utils";
import { detalheItens, detalheComodato } from "@/lib/detalhe-itens";
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
  // Detalhe dos itens do pedido na descrição (como no razão), incluindo o
  // comodato — que compõe o valor do título.
  const [itensPv, comodatos] = await Promise.all([
    tx.pedidoVendaItem.findMany({
      where: { pedidoVendaId: pedido.id },
      select: { quantidade: true, precoUnitario: true, item: { select: { descricao: true } } },
    }),
    tx.movimentacaoComodato.findMany({
      where: { pedidoVendaId: pedido.id },
      select: { tipo: true, quantidade: true, valorUnitario: true, item: { select: { descricao: true } } },
    }),
  ]);
  const det = [detalheItens(itensPv), detalheComodato(comodatos)].filter(Boolean).join("; ");
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
 * Fatura as ENTREGAS/RETIRADAS do pedido (decisão jul/2026, refinada: o contas a
 * receber nasce junto com a entrega — e entregas PARCIAIS por minuta também
 * contam, não só a total). Modelo catch-up idempotente: fatura a DIFERENÇA entre
 * o valor entregue acumulado (fração entregue de cada item × valor da linha; na
 * entrega TOTAL, o valorTotal do pedido — que inclui frete/desconto/comodato) e
 * o valor já faturado (Σ CRs não canceladas). Um lock de linha no pedido (FOR
 * UPDATE) serializa gatilhos concorrentes (minuta ENTREGUE × status × balcão).
 * O balcão (CR PAGA total no próprio fluxo) fica coberto: faturado ≥ entregue →
 * não gera nada. Vencimentos contam da DATA DO FATURAMENTO (a entrega), pela
 * condição de pagamento. Pula intragrupo, orçamento/cancelado e valores ≤ 0.
 * Retorna true se gerou título.
 */
export async function faturarEntregasPedido(pedidoVendaId: string): Promise<boolean> {
  const pedido = await prismaSemEscopo.pedidoVenda.findUnique({
    where: { id: pedidoVendaId },
    select: {
      id: true, empresaId: true, clienteId: true, numero: true, status: true, intragrupo: true,
      valorTotal: true, dataEmissao: true, naturezaFinanceiraId: true,
      condicaoPagamentoId: true, condicaoPagamento: true,
      itens: {
        select: {
          quantidade: true, valorTotal: true,
          minutaItens: { where: { minuta: { status: "ENTREGUE" } }, select: { quantidade: true } },
        },
      },
    },
  });
  if (!pedido || pedido.intragrupo) return false;
  if (!["CONFIRMADO", "EM_AGENDAMENTO", "CONCLUIDO"].includes(pedido.status)) return false;
  const valorTotal = decimalToNumber(pedido.valorTotal);
  if (valorTotal <= 0) return false;

  // Valor entregue acumulado (mesma definição de "entregue" do recomputarStatusPedido).
  let entregueAcum = 0;
  let tudoEntregue = pedido.itens.length > 0;
  for (const it of pedido.itens) {
    const qPed = decimalToNumber(it.quantidade);
    const qEnt = it.minutaItens.reduce((s, mi) => s + decimalToNumber(mi.quantidade), 0);
    if (qPed <= 0) continue;
    entregueAcum += decimalToNumber(it.valorTotal) * Math.min(qEnt / qPed, 1);
    if (qEnt < qPed - 0.0001) tudoEntregue = false;
  }
  // Frete/desconto global/comodato entram no acerto da entrega TOTAL.
  const alvo = tudoEntregue ? valorTotal : Math.min(Math.round(entregueAcum * 100) / 100, valorTotal);
  if (alvo <= 0.005) return false;

  const condicao = pedido.condicaoPagamentoId
    ? await prismaSemEscopo.condicaoPagamento.findUnique({ where: { id: pedido.condicaoPagamentoId } })
    : (pedido.condicaoPagamento
      ? await prismaSemEscopo.condicaoPagamento.findFirst({ where: { nome: pedido.condicaoPagamento } })
      : null);

  let gerou = false;
  await prismaSemEscopo.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "PedidoVenda" WHERE id = ${pedidoVendaId} FOR UPDATE`;
    const agg = await tx.contaReceber.aggregate({
      where: { pedidoVendaId, status: { not: "CANCELADA" } },
      _sum: { valorOriginal: true },
    });
    const faturado = decimalToNumber(agg._sum.valorOriginal ?? 0);
    const aFaturar = Math.round((alvo - faturado) * 100) / 100;
    if (aFaturar <= 0.005) return;
    await gerarContasReceberDoPedido(tx, { ...pedido, valorTotal: aFaturar, dataEmissao: new Date() }, condicao);
    await recomputarStatusPedido(tx, pedidoVendaId);
    gerou = true;
  });
  return gerou;
}
