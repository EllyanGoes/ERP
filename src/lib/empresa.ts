import { prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";

/**
 * Multiempresa. O id fixo da Tramontin vive em @/lib/prisma (junto do escopo);
 * re-exportado aqui para os call sites de numeração e afins.
 */
export { EMPRESA_PADRAO_ID };

/**
 * Resolve os campos de empresa do token de sessão (login/refresh).
 *
 * Fase 2: todo usuário ativo enxerga todas as empresas ativas do grupo (hoje,
 * só a Tramontin). O vínculo usuário↔empresa com permissões por empresa vem na
 * Fase 3. `atualAtiva` preserva a empresa ativa atual num refresh, se ela
 * continuar válida.
 */
export async function empresasParaSessao(atualAtiva?: string): Promise<{
  activeEmpresaId: string;
  empresaIds: string[];
}> {
  const empresas = await prismaSemEscopo.empresa.findMany({
    where: { ativo: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  const empresaIds = empresas.map((e) => e.id);
  const padrao =
    empresaIds.includes(EMPRESA_PADRAO_ID) ? EMPRESA_PADRAO_ID : empresaIds[0] ?? EMPRESA_PADRAO_ID;
  const activeEmpresaId = atualAtiva && empresaIds.includes(atualAtiva) ? atualAtiva : padrao;
  return { activeEmpresaId, empresaIds };
}
