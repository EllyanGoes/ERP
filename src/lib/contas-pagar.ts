import { Prisma } from "@prisma/client";
import { proximaSequenciaDaEmpresa } from "@/lib/empresa";
import { generateSimpleDocNumber } from "@/lib/utils";
import { detalheItens } from "@/lib/detalhe-itens";
import { calcularParcelas, type CondicaoParcelas } from "@/lib/parcelas";

/**
 * Gera as contas a PAGAR de um pedido de compra a partir do Documento de Entrada,
 * conforme a CONDIÇÃO DE PAGAMENTO (à vista / a prazo / parcelado / sem
 * vencimento). Todos nascem ABERTA, vinculados ao pedido de compra. Espelho de
 * `gerarContasReceberDoPedido`.
 */
export async function gerarContasPagarDoDocumento(
  tx: Prisma.TransactionClient,
  doc: {
    empresaId: string; fornecedorId: string | null; pedidoCompraId: string;
    // Documento de Entrada que originou o título (ausente no PA, que nasce no pedido).
    conferenciaId?: string | null;
    numeroPedido: string; valorTotal: unknown; dataBase: Date | string; naturezaFinanceiraId?: string | null;
    // Forma de pagamento PREVISTA (meio de quitação, ex.: permuta) — herdada do DE.
    formaPagamentoPrevistaId?: string | null;
    // PA: título nascido no PEDIDO (adiantamento a fornecedor), não na entrada.
    antecipado?: boolean;
  },
  condicao: CondicaoParcelas,
): Promise<number> {
  // Detalhe dos itens do pedido na descrição (como no razão): "Compra PC-X — 10×
  // Cimento × R$ 30; 5× Areia × R$ 50".
  const itensPc = await tx.pedidoCompraItem.findMany({
    where: { pedidoId: doc.pedidoCompraId },
    select: { quantidade: true, precoUnitario: true, item: { select: { descricao: true } } },
  });
  const det = detalheItens(itensPc);
  const antecipado = doc.antecipado === true;
  const baseDesc = `Compra ${doc.numeroPedido}${antecipado ? " (PA)" : ""}${det ? ` — ${det}` : ""}`;

  const parcelas = calcularParcelas(condicao, doc.valorTotal, doc.dataBase);
  for (const p of parcelas) {
    const numero = generateSimpleDocNumber("CP", await proximaSequenciaDaEmpresa(doc.empresaId, "CP"));
    await tx.contaPagar.create({
      data: {
        empresaId: doc.empresaId,
        numero,
        fornecedorId: doc.fornecedorId,
        pedidoCompraId: doc.pedidoCompraId,
        conferenciaId: doc.conferenciaId ?? null,
        antecipado,
        naturezaFinanceiraId: doc.naturezaFinanceiraId ?? null,
        formaPagamentoPrevistaId: doc.formaPagamentoPrevistaId ?? null,
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
 * PA (pagamento antecipado): gera o(s) título(s) a pagar JÁ NO PEDIDO quando a
 * condição de pagamento é marcada como `pagamentoAntecipado`. O título nasce
 * ABERTA (adiantamento a fornecedor); ao ser pago, contabiliza D Adiantamento a
 * Fornecedores / C Banco. Idempotente pelo guard `count(pedidoCompraId) === 0` —
 * a conferência não duplica. Best-effort: chamado pós-commit na criação do pedido.
 */
export async function gerarContasPagarAntecipadoDoPedido(pedidoId: string): Promise<number> {
  // prismaSemEscopo: chamado de webhooks/aprovações que podem agir sobre pedido de
  // OUTRA empresa (compras em grupo) — o escopo estouraria P2025. empresaId é explícito.
  const { prismaSemEscopo: prisma } = await import("@/lib/prisma");
  const pedido = await prisma.pedidoCompra.findUnique({
    where: { id: pedidoId },
    select: {
      id: true, empresaId: true, fornecedorId: true, numero: true, valorTotal: true,
      intragrupo: true, createdAt: true, condicaoPagamentoId: true,
      condicaoPagamentoRef: true,
    },
  });
  if (!pedido || pedido.intragrupo) return 0;
  const condicao = pedido.condicaoPagamentoRef;
  if (!condicao?.pagamentoAntecipado) return 0;

  const { recontabilizarTituloPagar } = await import("@/lib/contabilidade");
  const criados = await prisma.$transaction(async (tx) => {
    const jaTem = await tx.contaPagar.count({ where: { pedidoCompraId: pedido.id } });
    if (jaTem > 0) return [] as string[];
    const valorTotal = Number(pedido.valorTotal ?? 0);
    if (valorTotal <= 0) return [] as string[];
    await gerarContasPagarDoDocumento(tx, {
      empresaId: pedido.empresaId,
      fornecedorId: pedido.fornecedorId,
      pedidoCompraId: pedido.id,
      numeroPedido: pedido.numero,
      valorTotal,
      dataBase: pedido.createdAt,
      antecipado: true,
    }, condicao);
    const cps = await tx.contaPagar.findMany({ where: { pedidoCompraId: pedido.id }, select: { id: true } });
    return cps.map((c) => c.id);
  });
  for (const id of criados) await recontabilizarTituloPagar(id).catch(() => null);
  return criados.length;
}
