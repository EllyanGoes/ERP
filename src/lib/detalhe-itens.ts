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

/**
 * Detalhe do COMODATO de um pedido ("8× PALETE (comodato) × R$ 30,00") a partir
 * das movimentações (SAIDA soma; ENTRADA/devolução abate). Vazio se o líquido é
 * zero. Usado como sufixo do detalheItens nos históricos contábeis e descrições
 * de título — o comodato ENTRA no valorTotal do pedido, então sem ele a
 * descrição não bate com o valor lançado.
 */
export function detalheComodato(
  movs: { tipo: string; quantidade: unknown; valorUnitario: unknown; item?: { descricao?: string | null } | null }[],
): string {
  if (!movs.length) return "";
  const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const porItem = new Map<string, { qtd: number; valor: number }>();
  for (const m of movs) {
    const key = m.item?.descricao ?? "Vasilhame";
    const cur = porItem.get(key) ?? { qtd: 0, valor: decimalToNumber(m.valorUnitario) };
    cur.qtd += (m.tipo === "SAIDA" ? 1 : -1) * decimalToNumber(m.quantidade);
    porItem.set(key, cur);
  }
  return Array.from(porItem.entries())
    .filter(([, x]) => x.qtd > 0.0001)
    .map(([nome, x]) => {
      const qStr = Number.isInteger(x.qtd) ? String(x.qtd) : x.qtd.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
      return `${qStr}× ${nome} (comodato) × R$ ${fmt(x.valor)}`;
    })
    .join("; ");
}
