// ─────────────────────────────────────────────────────────────────────────────
// Cor de cada módulo, agrupada por ÁREA (não 17 cores soltas). Vai só no ÍCONE
// do módulo (droplist, topo do painel, faixa, atalhos do Início) — fundos e
// textos seguem neutros.
// ─────────────────────────────────────────────────────────────────────────────

const AREAS = {
  cadastros:   "text-slate-500 dark:text-slate-400",
  comercial:   "text-blue-600 dark:text-blue-400",
  suprimentos: "text-amber-600 dark:text-amber-400",
  financeiro:  "text-emerald-600 dark:text-emerald-400",
  pessoas:     "text-pink-600 dark:text-pink-400",
  operacao:    "text-orange-600 dark:text-orange-400",
  gestao:      "text-violet-600 dark:text-violet-400",
} as const;

const AREA_DO_MODULO: Record<string, keyof typeof AREAS> = {
  empresa: "cadastros",
  marketing: "comercial", comercial: "comercial",
  almoxarifado: "suprimentos", compras: "suprimentos",
  financeiro: "financeiro", contabilidade: "financeiro", fiscal: "financeiro",
  rh: "pessoas", sst: "pessoas",
  pcm: "operacao", pcp: "operacao", processos: "operacao",
  contratos: "gestao", projetos: "gestao", documentos: "gestao", investimentos: "gestao",
  configuracoes: "cadastros",
};

/** Classe de cor do ícone do módulo (texto/stroke). */
export function corDoModulo(id: string): string {
  return AREAS[AREA_DO_MODULO[id] ?? "cadastros"];
}

// Tons claros para fundo escuro (faixa de ícones). Classes literais: o Tailwind
// só gera o que está escrito no código.
const AREAS_FUNDO_ESCURO: Record<keyof typeof AREAS, string> = {
  cadastros: "text-slate-300", comercial: "text-blue-400", suprimentos: "text-amber-400",
  financeiro: "text-emerald-400", pessoas: "text-pink-400", operacao: "text-orange-400", gestao: "text-violet-400",
};

/** Cor do ícone do módulo sobre fundo escuro (faixa lateral). */
export function corDoModuloFundoEscuro(id: string): string {
  return AREAS_FUNDO_ESCURO[AREA_DO_MODULO[id] ?? "cadastros"];
}
