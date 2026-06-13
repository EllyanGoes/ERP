import { Prisma } from "@prisma/client";
import { proximaSequenciaDaEmpresa } from "@/lib/empresa";
import { generateDocNumber } from "@/lib/utils";
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
    numeroPedido: string; valorTotal: unknown; dataBase: Date | string;
  },
  condicao: CondicaoParcelas,
): Promise<number> {
  const parcelas = calcularParcelas(condicao, doc.valorTotal, doc.dataBase);
  for (const p of parcelas) {
    const numero = generateDocNumber("CP", await proximaSequenciaDaEmpresa(doc.empresaId, "CP"));
    await tx.contaPagar.create({
      data: {
        empresaId: doc.empresaId,
        numero,
        fornecedorId: doc.fornecedorId,
        pedidoCompraId: doc.pedidoCompraId,
        descricao: p.parcelaTotal ? `Compra ${doc.numeroPedido} (${p.parcelaNumero}/${p.parcelaTotal})` : `Compra ${doc.numeroPedido}`,
        valorOriginal: p.valor,
        dataVencimento: p.dataVencimento,
        status: "ABERTA",
        ...(p.grupoParcelamentoId ? { grupoParcelamentoId: p.grupoParcelamentoId, parcelaNumero: p.parcelaNumero, parcelaTotal: p.parcelaTotal } : {}),
      },
    });
  }
  return parcelas.length;
}
