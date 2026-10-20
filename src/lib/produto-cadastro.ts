// Regras do cadastro de produto (Item) usadas pela tela e pelo servidor:
// campos obrigatórios e trava de descrição duplicada. Auditoria de 20/10/2026
// achou 29 grupos de duplicados (clique duplo no Salvar / recriação por não
// achar na busca) e centenas de produtos sem unidade/tipo/categoria.
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type CadastroProduto = {
  tipo?: string | null;
  unidadeId?: string | null;
  tipoProdutoId?: string | null;
  categoriaEstoque?: string | null;
};

/** Campos obrigatórios que faltam. Serviço não entra no estoque → sem categoria. NCM não é obrigatório. */
export function camposFaltandoProduto(c: CadastroProduto): string[] {
  return [
    !c.unidadeId && "Unidade",
    !c.tipoProdutoId && "Tipo de produto",
    c.tipo !== "SERVICO" && !c.categoriaEstoque && "Categoria de estoque",
  ].filter(Boolean) as string[];
}

/** Chave de comparação: sem acento, sem pontuação/espaço, minúscula ("CAPA  HIDRAULICA 08" = "Capa hidráulica 08"). */
export function chaveDescricaoProduto(descricao: string): string {
  return descricao.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type ProdutoDuplicado = { id: string; codigo: string; descricao: string; unidade: { sigla: string } | null };

/** Produto ATIVO com a mesma descrição (pela chave), exceto o próprio. */
export async function buscarProdutoDuplicado(db: Db, descricao: string, excetoId?: string): Promise<ProdutoDuplicado | null> {
  const chave = chaveDescricaoProduto(descricao);
  if (!chave) return null;
  // Sem unaccent no banco: compara em memória (cadastro tem ~1,1 mil ativos).
  const candidatos = await db.item.findMany({
    where: { ativo: true, ...(excetoId ? { id: { not: excetoId } } : {}) },
    select: { id: true, codigo: true, descricao: true, unidade: { select: { sigla: true } } },
  });
  return candidatos.find((c) => chaveDescricaoProduto(c.descricao) === chave) ?? null;
}

/** Serializa criações/renomeações da mesma descrição (duplo clique simultâneo). */
export async function travarDescricaoProduto(tx: Prisma.TransactionClient, descricao: string) {
  await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${"item-desc:" + chaveDescricaoProduto(descricao)}))`;
}

/** Lançado dentro da transação quando o duplicado aparece depois da trava. */
export class DuplicadoError extends Error {
  constructor(public duplicado: ProdutoDuplicado) { super("Produto duplicado"); }
}

export function respostaDuplicado(d: ProdutoDuplicado) {
  return {
    error: `Já existe o produto ${d.codigo} — ${d.descricao}. Use o cadastro existente.`,
    duplicado: d,
  };
}
