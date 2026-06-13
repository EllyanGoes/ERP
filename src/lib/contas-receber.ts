import { Prisma } from "@prisma/client";
import { proximaSequenciaDaEmpresa } from "@/lib/empresa";
import { generateDocNumber } from "@/lib/utils";
import { calcularParcelas, type CondicaoParcelas } from "@/lib/parcelas";

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
        descricao: p.parcelaTotal ? `Faturamento pedido ${pedido.numero} (${p.parcelaNumero}/${p.parcelaTotal})` : `Faturamento pedido ${pedido.numero}`,
        valorOriginal: p.valor,
        dataVencimento: p.dataVencimento,
        status: "ABERTA",
        ...(p.grupoParcelamentoId ? { grupoParcelamentoId: p.grupoParcelamentoId, parcelaNumero: p.parcelaNumero, parcelaTotal: p.parcelaTotal } : {}),
      },
    });
  }
  return parcelas.length;
}
