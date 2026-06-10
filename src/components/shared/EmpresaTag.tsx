"use client";

import { useSession } from "@/lib/session-context";

// Cores fixas por posição da empresa na sessão (estável entre telas)
const CORES = [
  "bg-blue-50 text-blue-700 border-blue-200",
  "bg-purple-50 text-purple-700 border-purple-200",
  "bg-teal-50 text-teal-700 border-teal-200",
  "bg-amber-50 text-amber-700 border-amber-200",
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
