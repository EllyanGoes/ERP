// Custo médio (CMPM) por empresa do grupo.
//
// O cadastro do produto é compartilhado entre as empresas, mas cada uma tem o
// próprio custo (fabricação numa, compra noutra). O modelo ItemCustoEmpresa
// fica FORA do escopo automático do prisma.ts (chave composta empresaId+itemId,
// como a Sequencia) — todo acesso passa por aqui com a empresa explícita.
// Item.precoCusto continua sendo mantido como CMPM global/legado e serve de
// fallback para empresas que ainda não têm custo próprio registrado.

// Cliente/transação mínimos: aceita tanto o client escopado quanto o cru.
type DbCusto = {
  itemCustoEmpresa: {
    findUnique(args: { where: { empresaId_itemId: { empresaId: string; itemId: string } } }): Promise<{ precoCusto: unknown } | null>;
    findMany(args: { where: { empresaId: string; itemId: { in: string[] } } }): Promise<{ itemId: string; precoCusto: unknown }[]>;
    upsert(args: {
      where: { empresaId_itemId: { empresaId: string; itemId: string } };
      create: { empresaId: string; itemId: string; precoCusto: number | null };
      update: { precoCusto: number | null };
    }): Promise<unknown>;
  };
  estoqueItem: {
    findMany(args: { where: { empresaId: string; itemId: string; clienteDonoId: null } }): Promise<{ quantidadeAtual: unknown }[]>;
  };
  item: {
    findMany(args: { where: { id: { in: string[] } }; select: { id: true; precoCusto: true } }): Promise<{ id: string; precoCusto: unknown }[]>;
  };
};

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/**
 * Custos dos itens na empresa, com fallback no CMPM global (Item.precoCusto)
 * para itens sem custo próprio na empresa. Retorna Map itemId → custo|null.
 */
export async function custosDaEmpresa(db: DbCusto, empresaId: string, itemIds: string[]): Promise<Map<string, number | null>> {
  const resultado = new Map<string, number | null>();
  if (itemIds.length === 0) return resultado;

  const proprios = await db.itemCustoEmpresa.findMany({ where: { empresaId, itemId: { in: itemIds } } });
  for (const r of proprios) resultado.set(r.itemId, num(r.precoCusto));

  const faltantes = itemIds.filter((id) => resultado.get(id) == null);
  if (faltantes.length > 0) {
    const globais = await db.item.findMany({ where: { id: { in: faltantes } }, select: { id: true, precoCusto: true } });
    for (const g of globais) {
      if (resultado.get(g.id) == null) resultado.set(g.id, num(g.precoCusto));
    }
  }
  return resultado;
}

/** Chave do mapa de custos por (empresa, item). */
export const chaveCustoEmpresa = (empresaId: string, itemId: string) => `${empresaId}|${itemId}`;

/**
 * Custos próprios em lote para pares (empresa, item) — sem fallback: ausência
 * no mapa significa "use o CMPM global (Item.precoCusto) que você já tem".
 */
export async function custosPorEmpresaItem(
  db: DbCusto,
  pares: Array<{ empresaId: string; itemId: string }>,
): Promise<Map<string, number>> {
  const porEmpresa = new Map<string, Set<string>>();
  for (const p of pares) {
    if (!p.empresaId || !p.itemId) continue;
    const set = porEmpresa.get(p.empresaId) ?? new Set<string>();
    set.add(p.itemId);
    porEmpresa.set(p.empresaId, set);
  }

  const resultado = new Map<string, number>();
  for (const [empresaId, itemIds] of Array.from(porEmpresa.entries())) {
    const rows = await db.itemCustoEmpresa.findMany({ where: { empresaId, itemId: { in: Array.from(itemIds) } } });
    for (const r of rows) {
      const v = num(r.precoCusto);
      if (v != null) resultado.set(chaveCustoEmpresa(empresaId, r.itemId), v);
    }
  }
  return resultado;
}

/**
 * Aplica uma ENTRADA com custo no CMPM da empresa (mesma fórmula do global):
 *   novo = (saldoBase × custoAtual + qtd × valorUnitario) / (saldoBase + qtd)
 * Chamar DEPOIS de o estoque já ter sido incrementado (o saldo base é o total
 * da empresa menos a quantidade que acabou de entrar).
 */
export async function aplicarCmpmEmpresa(
  tx: DbCusto,
  empresaId: string,
  itemId: string,
  quantidade: number,
  valorUnitario: number,
): Promise<number> {
  const atual = await tx.itemCustoEmpresa.findUnique({ where: { empresaId_itemId: { empresaId, itemId } } });
  const custoAtual = num(atual?.precoCusto) ?? 0;

  const linhas = await tx.estoqueItem.findMany({ where: { empresaId, itemId, clienteDonoId: null } });
  const totalEmpresa = linhas.reduce((s, e) => s + (num(e.quantidadeAtual) ?? 0), 0);
  const baseSaldo = Math.max(totalEmpresa - quantidade, 0);

  const novo = baseSaldo > 0
    ? (baseSaldo * custoAtual + quantidade * valorUnitario) / (baseSaldo + quantidade)
    : valorUnitario;

  await tx.itemCustoEmpresa.upsert({
    where: { empresaId_itemId: { empresaId, itemId } },
    create: { empresaId, itemId, precoCusto: novo },
    update: { precoCusto: novo },
  });
  return novo;
}

/** Define o custo da empresa diretamente (inventário com custo informado). */
export async function definirCustoEmpresa(tx: DbCusto, empresaId: string, itemId: string, custo: number | null): Promise<void> {
  await tx.itemCustoEmpresa.upsert({
    where: { empresaId_itemId: { empresaId, itemId } },
    create: { empresaId, itemId, precoCusto: custo },
    update: { precoCusto: custo },
  });
}

/** Zera o custo da empresa quando o estoque dela acabou (exclusão de entrada). */
export async function zerarCustoEmpresaSeSemEstoque(tx: DbCusto, empresaId: string, itemId: string): Promise<void> {
  const linhas = await tx.estoqueItem.findMany({ where: { empresaId, itemId, clienteDonoId: null } });
  const total = linhas.reduce((s, e) => s + (num(e.quantidadeAtual) ?? 0), 0);
  if (total <= 0) {
    await tx.itemCustoEmpresa.upsert({
      where: { empresaId_itemId: { empresaId, itemId } },
      create: { empresaId, itemId, precoCusto: null },
      update: { precoCusto: null },
    });
  }
}
