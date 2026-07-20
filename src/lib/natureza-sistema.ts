import type { Prisma } from "@prisma/client";
import { prismaSemEscopo } from "@/lib/prisma";

// Naturezas TRAVADAS do sistema (encargos da baixa) — semeadas por migration com
// chave estável por empresa. O motor referencia por chave (renomear o nome na
// tela não quebra nada); a API de naturezas bloqueia mudar tipo/grupo/excluir.
export type ChaveNaturezaSistema =
  | "juros-pagos"
  | "multa-paga"
  | "tarifa-bancaria"
  | "juros-recebidos"
  | "taxa-cartao"
  | "desagio-antecipacao";

type Db = Pick<Prisma.TransactionClient, "naturezaFinanceira">;

/** Natureza travada do sistema pela chave estável (null se o seed não rodou). */
export async function naturezaSistema(
  db: Db | null,
  empresaId: string,
  chave: ChaveNaturezaSistema,
): Promise<{ id: string } | null> {
  const client = db ?? prismaSemEscopo;
  return client.naturezaFinanceira.findUnique({
    where: { empresaId_sistemaChave: { empresaId, sistemaChave: chave } },
    select: { id: true },
  });
}

/**
 * Lançamento NOVO só aceita natureza ATIVA (plano reestruturado jul/2026):
 * natureza desativada aponta a sucessora — a mensagem orienta qual usar.
 * Retorna null se tudo ok; senão a mensagem de erro (o chamador vira 422).
 * Não usar em leitura/edição de histórico — título antigo continua legível.
 */
export async function validarNaturezasAtivas(
  db: Db | null,
  ids: (string | null | undefined)[],
): Promise<string | null> {
  const unicos = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (unicos.length === 0) return null;
  const client = db ?? prismaSemEscopo;
  const rows = await client.naturezaFinanceira.findMany({
    where: { id: { in: unicos } },
    select: { id: true, nome: true, ativo: true, sucessora: { select: { codigo: true, nome: true } } },
  });
  const inativa = rows.find((r) => !r.ativo);
  if (!inativa) return null;
  const suc = inativa.sucessora ? ` — use a sucessora ${inativa.sucessora.codigo ? `${inativa.sucessora.codigo} ` : ""}${inativa.sucessora.nome}` : "";
  return `A natureza "${inativa.nome}" está inativa${suc}.`;
}
