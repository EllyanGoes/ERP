"use client";

import { useSession } from "@/lib/session-context";

// Cores fixas por posição da empresa na sessão (estável entre telas)
const CORES = [
  "bg-info/10 text-info border-info/30",
  "bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/30",
  "bg-teal-50 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-500/30",
  "bg-warning/10 text-warning border-warning/30",
];

/**
 * Tag com o nome da empresa dona de um registro (multiempresa). Só renderiza
 * para quem enxerga 2+ empresas — para os demais a coluna fica invisível.
 */
export default function EmpresaTag({ empresaId }: { empresaId?: string | null }) {
  const { user } = useSession();
  const empresas = user?.empresas ?? [];
  if (empresas.length <= 1 || !empresaId) return null;
  const idx = empresas.findIndex((e) => e.id === empresaId);
  const empresa = empresas[idx];
  if (!empresa) return null;
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium whitespace-nowrap ${CORES[idx % CORES.length]}`}
      title={`Empresa: ${empresa.nome}`}
    >
      {empresa.nome}
    </span>
  );
}
