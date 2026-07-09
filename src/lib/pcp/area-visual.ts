import { Factory, Flame, FlaskConical, Package, Shapes, Shovel, Wind, type LucideIcon } from "lucide-react";

// Identidade VISUAL das áreas de produção — compartilhada entre o Fluxo de
// Produção (abas/lista/colunas) e o Relatório de Produção, para a mesma etapa
// ter sempre a mesma cor e o mesmo ícone em todas as telas.

export const CORES_AREA = [
  { dot: "bg-sky-500",     txt: "text-sky-700 dark:text-sky-400",         chip: "bg-sky-500/10 text-sky-700 dark:text-sky-400",         borda: "border-sky-500" },
  { dot: "bg-amber-500",   txt: "text-amber-700 dark:text-amber-400",     chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400",   borda: "border-amber-500" },
  { dot: "bg-violet-500",  txt: "text-violet-700 dark:text-violet-400",   chip: "bg-violet-500/10 text-violet-700 dark:text-violet-400", borda: "border-violet-500" },
  { dot: "bg-emerald-500", txt: "text-emerald-700 dark:text-emerald-400", chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", borda: "border-emerald-500" },
  { dot: "bg-rose-500",    txt: "text-rose-700 dark:text-rose-400",       chip: "bg-rose-500/10 text-rose-700 dark:text-rose-400",       borda: "border-rose-500" },
  { dot: "bg-cyan-600",    txt: "text-cyan-700 dark:text-cyan-400",       chip: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",       borda: "border-cyan-600" },
  { dot: "bg-orange-500",  txt: "text-orange-700 dark:text-orange-400",   chip: "bg-orange-500/10 text-orange-700 dark:text-orange-400", borda: "border-orange-500" },
  { dot: "bg-indigo-500",  txt: "text-indigo-700 dark:text-indigo-400",   chip: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400", borda: "border-indigo-500" },
];
export const COR_AREA_NEUTRA = { dot: "bg-slate-400", txt: "text-muted-foreground", chip: "bg-muted text-muted-foreground", borda: "border-border" };
export const corArea = (i: number) => (i >= 0 ? CORES_AREA[i % CORES_AREA.length] : COR_AREA_NEUTRA);

// Ícone por área (heurística pelo nome) — as abas mostram só o ícone; o nome
// completo vai no tooltip.
export function iconeArea(nome: string): LucideIcon {
  const n = nome.toLowerCase();
  if (n.includes("prepar")) return Shovel;
  if (n.includes("mistura")) return FlaskConical;
  if (n.includes("conform") || n.includes("extrus")) return Shapes;
  if (n.includes("seca")) return Wind;
  if (n.includes("queima") || n.includes("forno")) return Flame;
  if (n.includes("embal")) return Package;
  return Factory;
}
