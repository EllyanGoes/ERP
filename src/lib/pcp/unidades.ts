// Helpers de unidade/base de consumo para a produção.

type ItemUnidadeSigla = { fatorConversao: unknown; unidade: { sigla: string } | null };

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Peças por palete de um produto = fator da ItemUnidade com sigla "PLT". null se não tiver. */
export function pecasPorPalete(itemUnidades: ItemUnidadeSigla[]): number | null {
  const plt = itemUnidades.find((u) => (u.unidade?.sigla ?? "").toUpperCase() === "PLT");
  if (!plt || plt.fatorConversao == null) return null;
  const f = num(plt.fatorConversao);
  return f > 0 ? f : null;
}

/**
 * Fator de base p/ CONSUMO (qtd da OP na unidade-PRINCIPAL: peça/lote).
 * POR_MILHEIRO → por 1000; POR_PALETE → por palete (1/peçasPorPalete); demais → por unidade.
 */
export function baseFatorConsumo(base: string, ppp: number | null): number {
  if (base === "POR_MILHEIRO") return 0.001;
  if (base === "POR_PALETE") return ppp && ppp > 0 ? 1 / ppp : 1;
  return 1;
}

/**
 * Fator de base p/ CUSTEIO (por milheiro). POR_UNIDADE → ×1000 (por peça → por milheiro);
 * POR_PALETE → 1000/peçasPorPalete (paletes por milheiro); demais → 1.
 */
export function baseFatorCusteioMilheiro(base: string, ppp: number | null): number {
  if (base === "POR_UNIDADE") return 1000;
  if (base === "POR_PALETE") return ppp && ppp > 0 ? 1000 / ppp : 1;
  return 1;
}
