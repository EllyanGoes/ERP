import { Prisma } from "@prisma/client";
import { proximaSequenciaDaEmpresa } from "@/lib/empresa";
import { generateDocNumber } from "@/lib/utils";
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
    numeroPedido: string; valorTotal: unknown; dataBase: Date | string; naturezaFinanceiraId?: string | null;
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
  const baseDesc = `Compra ${doc.numeroPedido}${det ? ` — ${det}` : ""}`;

  const parcelas = calcularParcelas(condicao, doc.valorTotal, doc.dataBase);
  for (const p of parcelas) {
    const numero = generateDocNumber("CP", await proximaSequenciaDaEmpresa(doc.empresaId, "CP"));
    await tx.contaPagar.create({
      data: {
        empresaId: doc.empresaId,
        numero,
        fornecedorId: doc.fornecedorId,
        pedidoCompraId: doc.pedidoCompraId,
        naturezaFinanceiraId: doc.naturezaFinanceiraId ?? null,
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
