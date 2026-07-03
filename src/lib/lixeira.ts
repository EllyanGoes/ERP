import type { Prisma } from "@prisma/client";

// Lixeira de documentos: snapshot COMPLETO gravado no início da transação de
// cada DELETE destrutivo (documento + filhos + vínculos, com os dados ainda
// vivos) — se o delete falhar, o snapshot faz rollback junto. Permite consultar
// e restaurar exclusões acidentais (caso MIN-0201, jul/2026). Consulta e
// restauração em /admin/lixeira; retenção de 90 dias via cron limpar-lixeira.

export type TipoLixeira =
  | "PEDIDO_VENDA"
  | "MINUTA"
  | "PEDIDO_COMPRA"
  | "COTACAO_COMPRA"
  | "CONFERENCIA_COMPRA"
  | "ORDEM_PRODUCAO"
  | "CONTA_BANCARIA";

type Db = Pick<Prisma.TransactionClient, "lixeira">;

/**
 * Grava o snapshot na lixeira DENTRO da transação do delete. `snapshot` é o
 * objeto rico (findUnique com include) — serializado via JSON para Decimals/Dates
 * virarem strings estáveis. Nunca lança (um erro aqui não pode impedir o delete
 * legítimo… mas como roda na tx, um throw abortaria tudo — por isso o catch).
 */
export async function salvarNaLixeira(
  db: Db,
  entrada: {
    empresaId: string;
    tipo: TipoLixeira;
    origemId: string;
    numero?: string | null;
    descricao?: string | null;
    snapshot: unknown;
    apagadoPor?: string | null;
  },
): Promise<void> {
  try {
    await db.lixeira.create({
      data: {
        empresaId: entrada.empresaId,
        tipo: entrada.tipo,
        origemId: entrada.origemId,
        numero: entrada.numero ?? null,
        descricao: entrada.descricao?.slice(0, 500) ?? null,
        snapshot: JSON.parse(JSON.stringify(entrada.snapshot)) as Prisma.InputJsonValue,
        apagadoPor: entrada.apagadoPor ?? null,
      },
    });
  } catch (e) {
    console.error("[lixeira] snapshot falhou (delete segue):", e);
  }
}
