// Prazos dos processos para a Agenda própria do módulo e o feed ICS (docs/processos-prd.md, fase 2).
// Decisão: feed SEPARADO do Projetos (o Projetos é standalone por decisão do dono) — mesmo padrão
// de token HMAC na URL, com prefixo próprio (src/lib/processos-externo.ts → tokenFeedProcessos).
import { prismaSemEscopo } from "@/lib/prisma";
import { getUserModulos, hasModulo } from "@/lib/permissions";
import { empresasVisiveis } from "@/lib/empresa";
import { filtroVisibilidade, SITUACOES_ABERTAS } from "@/lib/processos";

export type PrazoAgenda = {
  id: string; descricao: string; vence: Date; avisoDias: number; responsavelId: string | null;
  processo: { id: string; codigo: string; titulo: string; orgao: string; confidencial: boolean; empresaId: string; responsavel: { nome: string } | null };
};

/**
 * Prazos PENDENTES dos processos abertos que o usuário pode ver (empresas do usuário + regra de
 * confidencial). `meus` = só prazos/processos em que ele é o responsável. null se o usuário não
 * existe, está inativo ou não tem o módulo Processos.
 */
export async function prazosDaAgenda(usuarioId: string, opts: { meus?: boolean; empresaIds?: string[] } = {}): Promise<PrazoAgenda[] | null> {
  const u = await prismaSemEscopo.usuario.findUnique({ where: { id: usuarioId }, select: { id: true, ativo: true, perfil: true } });
  if (!u?.ativo) return null;
  const perfil = u.perfil as "ADMIN" | "USUARIO";
  if (perfil !== "ADMIN" && !hasModulo(await getUserModulos(u.id), "processos")) return null;
  const permitidas = (await empresasVisiveis(u.id, perfil)).map((e) => e.id);
  const empresaIds = opts.empresaIds ? opts.empresaIds.filter((e) => permitidas.includes(e)) : permitidas;
  const visivel = await filtroVisibilidade({ sub: u.id, perfil });
  return prismaSemEscopo.processoPrazo.findMany({
    where: {
      status: "PENDENTE",
      processo: { empresaId: { in: empresaIds }, situacao: { in: SITUACOES_ABERTAS }, AND: [visivel] },
      ...(opts.meus ? { OR: [{ responsavelId: u.id }, { responsavelId: null, processo: { responsavelId: u.id } }] } : {}),
    },
    orderBy: { vence: "asc" },
    select: {
      id: true, descricao: true, vence: true, avisoDias: true, responsavelId: true,
      processo: { select: { id: true, codigo: true, titulo: true, orgao: true, confidencial: true, empresaId: true, responsavel: { select: { nome: true } } } },
    },
  });
}
