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
