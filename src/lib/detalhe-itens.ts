import { decimalToNumber } from "@/lib/utils";

/**
 * Detalhe "qtd× produto × R$ unit" de uma lista de itens (com corte em `max` e
 * "+N item(ns)"). Usado no histórico contábil E na descrição dos títulos
 * (contas a pagar/receber) para identificar o que o pedido contém.
 */
export function detalheItens(
  itens: { quantidade: unknown; precoUnitario?: unknown; item?: { descricao?: string | null } | null }[],
  max = 4,
): string {
  if (!itens.length) return "";
  const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const partes = itens.slice(0, max).map((it) => {
    const q = decimalToNumber(it.quantidade);
    const qStr = Number.isInteger(q) ? String(q) : q.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
    const desc = it.item?.descricao ?? "item";
    const pu = it.precoUnitario != null ? decimalToNumber(it.precoUnitario) : null;
    return `${qStr}× ${desc}${pu != null ? ` × R$ ${fmt(pu)}` : ""}`;
  });
  const resto = itens.length - max;
  return partes.join("; ") + (resto > 0 ? ` +${resto} item(ns)` : "");
}
