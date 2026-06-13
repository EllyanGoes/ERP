import { prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";

/**
 * Multiempresa. O id fixo da Tramontin vive em @/lib/prisma (junto do escopo);
 * re-exportado aqui para os call sites de numeração e afins.
 */
export { EMPRESA_PADRAO_ID };

export type EmpresaResumo = { id: string; nome: string; slug: string | null };

/**
 * Id da conta "Caixa em Dinheiro" de cada empresa (uma por empresa, semeada na
 * migration). A Tramontin mantém o id histórico `caixa-geral` (referenciado em
 * lançamentos antigos); as demais usam `caixa-<empresaId>`. Usado como destino
 * padrão dos recebimentos em dinheiro, no lugar do antigo `caixa-geral` fixo
 * (que vazava o caixa entre empresas).
 */
export function contaCaixaIdDaEmpresa(empresaId: string): string {
  return empresaId === EMPRESA_PADRAO_ID ? "caixa-geral" : `caixa-${empresaId}`;
}

/**
 * Próximo número de uma sequência de UMA EMPRESA ESPECÍFICA (não a ativa).
 * Usado na cadeia de compras em modo grupo: a cotação herda a empresa da
 * solicitação, o pedido herda da cotação etc. — e o número deve sair da
 * sequência da empresa dona do documento. Usa o client cru porque o escopado
 * reescreveria o seletor para a empresa ativa. Roda FORA da transação do
 * chamador (falha depois do incremento só deixa um "buraco" na numeração).
 */
export async function proximaSequenciaDaEmpresa(empresaId: string, prefixo: string): Promise<number> {
  const seq = await prismaSemEscopo.sequencia.upsert({
    where: { empresaId_prefixo: { empresaId, prefixo } },
    update: { ultimo: { increment: 1 } },
    create: { empresaId, prefixo, ultimo: 1 },
  });
  return seq.ultimo;
}

/**
 * Empresas que um usuário pode ativar no seletor (Fase 3):
 *   • ADMIN — todas as empresas ativas do grupo;
 *   • USUARIO — as vinculadas em UsuarioEmpresa (∩ ativas); sem nenhum
 *     vínculo, cai na Tramontin (preserva o comportamento de antes do
 *     multiempresa para os usuários existentes).
 */
export async function empresasVisiveis(
  usuarioId: string,
  perfil: "ADMIN" | "USUARIO"
): Promise<EmpresaResumo[]> {
  const ativas = await prismaSemEscopo.empresa.findMany({
    where: { ativo: true },
    select: { id: true, razaoSocial: true, nomeFantasia: true, slug: true },
    orderBy: { createdAt: "asc" },
  });
  const resumo = (e: (typeof ativas)[number]): EmpresaResumo => ({
    id: e.id,
    nome: e.nomeFantasia ?? e.razaoSocial,
    slug: e.slug,
  });

  if (perfil === "ADMIN") return ativas.map(resumo);

  const vinculos = await prismaSemEscopo.usuarioEmpresa.findMany({
    where: { usuarioId },
    select: { empresaId: true },
  });
  const vinculadas = new Set(vinculos.map((v) => v.empresaId));
  const visiveis = ativas.filter((e) => vinculadas.has(e.id));
  if (visiveis.length > 0) return visiveis.map(resumo);

  const padrao = ativas.find((e) => e.id === EMPRESA_PADRAO_ID);
  return padrao ? [resumo(padrao)] : [];
}

/**
 * Resolve os campos de empresa do token de sessão (login/refresh/switch).
 * `atualAtiva` preserva a empresa ativa atual, se ela continuar permitida.
 */
export async function empresasParaSessao(
  usuarioId: string,
  perfil: "ADMIN" | "USUARIO",
  atualAtiva?: string
): Promise<{ activeEmpresaId: string; empresaIds: string[]; empresas: EmpresaResumo[] }> {
  const empresas = await empresasVisiveis(usuarioId, perfil);
  const empresaIds = empresas.map((e) => e.id);
  const padrao =
    empresaIds.includes(EMPRESA_PADRAO_ID) ? EMPRESA_PADRAO_ID : empresaIds[0] ?? EMPRESA_PADRAO_ID;
  const activeEmpresaId = atualAtiva && empresaIds.includes(atualAtiva) ? atualAtiva : padrao;
  return { activeEmpresaId, empresaIds, empresas };
}
