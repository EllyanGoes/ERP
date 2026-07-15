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
 * Fatura o PEDIDO conforme a NEGOCIAÇÃO (decisão jul/2026, v2): os títulos
 * nascem do pedido — valor TOTAL e parcelas da condição de pagamento, com
 * vencimentos contados da EMISSÃO — e INDEPENDEM da entrega. (O modelo
 * anterior faturava a fração entregue a cada minuta, fragmentando a cobrança
 * em títulos por entrega — ex.: PV-0261 com 2 CRs de 222,45.)
 * Catch-up idempotente: fatura a DIFERENÇA entre o valorTotal e o já faturado
 * (Σ CRs não canceladas) — cobre o balcão (CR PAGA no próprio fluxo → não gera
 * nada), pedidos já faturados em parte pelo modelo antigo (gera só o resto) e
 * gatilhos concorrentes (lock de linha FOR UPDATE no pedido).
 * Gatilhos: CONFIRMAÇÃO do pedido (negociação fechada); entregas/conclusão
 * seguem chamando como rede de segurança p/ pedidos confirmados antes desta
 * regra. Pula intragrupo, orçamento/cancelado e valores ≤ 0.
 * Retorna true se gerou título.
 */
export async function faturarPedido(pedidoVendaId: string): Promise<boolean> {
  const pedido = await prismaSemEscopo.pedidoVenda.findUnique({
    where: { id: pedidoVendaId },
    select: {
      id: true, empresaId: true, clienteId: true, numero: true, status: true, intragrupo: true,
      valorTotal: true, dataEmissao: true, naturezaFinanceiraId: true,
      condicaoPagamentoId: true, condicaoPagamento: true,
    },
  });
  if (!pedido || pedido.intragrupo) return false;
  if (!["CONFIRMADO", "EM_AGENDAMENTO", "CONCLUIDO"].includes(pedido.status)) return false;
  const valorTotal = decimalToNumber(pedido.valorTotal);
  if (valorTotal <= 0) return false;

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
    const aFaturar = Math.round((valorTotal - faturado) * 100) / 100;
    if (aFaturar > 0.005) {
      // Vencimentos contam da EMISSÃO do pedido (a negociação), não da entrega.
      await gerarContasReceberDoPedido(tx, { ...pedido, valorTotal: aFaturar, dataEmissao: pedido.dataEmissao }, condicao);
      gerou = true;
    }
    // Recomputa SEMPRE (mesmo sem nada a faturar): esta função roda após toda
    // entrega/retirada, então ela é o backstop que realinha statusEntrega e
    // statusFinanceiro — sair cedo aqui já deixou pedido preso em "Pendente"
    // com minuta ENTREGUE (PV-0371, jul/2026).
    await recomputarStatusPedido(tx, pedidoVendaId);
  });
  return gerou;
}

/** @deprecated Nome antigo (modelo por entrega) — usa o faturamento por pedido. */
export const faturarEntregasPedido = faturarPedido;
