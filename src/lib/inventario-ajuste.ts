import type { Prisma } from "@prisma/client";
import { definirCustoEmpresa } from "@/lib/custo-empresa";
import { recalcularSaldos } from "@/lib/estoque-saldos";

export type ItemAjusteInventario = {
  itemId: string;
  saldoFisico?: number | string | null; // contagem física; null/"" = não contado
  custoUnitario?: number | null;
};

/**
 * Aplica os ajustes de um inventário CONCLUÍDO: (a) atualiza custo dos itens com
 * custoUnitario; (b) leva o estoque PRÓPRIO (clienteDonoId null) de cada item, no
 * local do inventário, à contagem física (saldoFisico), gerando movimentação de
 * AJUSTE com documento = número do inventário; (c) normaliza a cadeia de saldos
 * corridos dos itens ajustados. Retorna os itemIds que sofreram ajuste.
 */
export async function aplicarAjustesInventario(
  tx: Prisma.TransactionClient,
  inv: { numero: string; empresaId: string; localEstoqueId: string },
  itens: ItemAjusteInventario[],
): Promise<string[]> {
  const { localEstoqueId } = inv;
  const r3 = (x: number) => Math.round(x * 1000) / 1000; // saldos Decimal(15,3)
  const afetados = new Set<string>();

  for (const it of itens) {
    if (it.custoUnitario != null && it.custoUnitario > 0) {
      await tx.item.update({
        where: { id: it.itemId },
        data:  { precoCusto: parseFloat(String(it.custoUnitario)) },
      });
      // Custo próprio da empresa dona do inventário (custo por empresa).
      await definirCustoEmpresa(tx, inv.empresaId, it.itemId, parseFloat(String(it.custoUnitario)));
    }

    // Ajuste de saldo: leva o estoque PRÓPRIO (clienteDonoId null) do item,
    // neste local, à contagem física. Só lança se houver diferença.
    if (it.saldoFisico != null && it.saldoFisico !== "") {
      const saldoFisico = r3(parseFloat(String(it.saldoFisico)));
      const estoque = await tx.estoqueItem.findFirst({
        where: { itemId: it.itemId, localEstoqueId, clienteDonoId: null },
        select: { id: true, quantidadeAtual: true },
      });
      const saldoAntes = estoque ? parseFloat(String(estoque.quantidadeAtual)) : 0;
      const diff = r3(saldoFisico - saldoAntes);
      if (diff !== 0) {
        if (estoque) {
          await tx.estoqueItem.update({ where: { id: estoque.id }, data: { quantidadeAtual: saldoFisico } });
        } else {
          await tx.estoqueItem.create({
            data: {
              empresaId: inv.empresaId,
              itemId: it.itemId,
              localEstoqueId,
              quantidadeAtual: saldoFisico,
              quantidadeMin: 0,
              clienteDonoId: null,
            },
          });
        }
        await tx.movimentacaoEstoque.create({
          data: {
            empresaId: inv.empresaId,
            itemId: it.itemId,
            localEstoqueId,
            tipo: "AJUSTE",
            quantidade: Math.abs(diff),
            saldoAntes,
            saldoDepois: saldoFisico,
            documento: inv.numero,
            observacoes: `Ajuste por inventário ${inv.numero}`,
            clienteDonoId: null,
          },
        });
        afetados.add(it.itemId);
      }
    }
  }

  // Normaliza a cadeia de saldos corridos de cada item ajustado.
  for (const itemId of Array.from(afetados)) {
    await recalcularSaldos(tx, itemId, localEstoqueId, null);
  }

  return Array.from(afetados);
}
