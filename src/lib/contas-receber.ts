import { Prisma } from "@prisma/client";
import { proximaSequenciaDaEmpresa } from "@/lib/empresa";
import { generateDocNumber } from "@/lib/utils";
import { detalheItens } from "@/lib/detalhe-itens";
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
