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
    findUnique(args: { where: { id: string }; select: { categoriaEstoque: true } }): Promise<{ categoriaEstoque: unknown } | null>;
  };
};

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/**
 * Custos dos itens ESTRITAMENTE na empresa (ItemCustoEmpresa). SEM fallback no
 * CMPM global: o custo é por empresa, então um item sem entrada/movimentação
 * com custo na empresa fica sem custo (ausente no Map) — nunca herda o custo
 * de outra empresa. Retorna Map itemId → custo (só os que têm custo próprio).
 */
export async function custosDaEmpresa(db: DbCusto, empresaId: string, itemIds: string[]): Promise<Map<string, number | null>> {
  const resultado = new Map<string, number | null>();
  if (itemIds.length === 0) return resultado;

  const proprios = await db.itemCustoEmpresa.findMany({ where: { empresaId, itemId: { in: itemIds } } });
  for (const r of proprios) {
    const v = num(r.precoCusto);
    if (v != null) resultado.set(r.itemId, v);
  }
  return resultado;
}

/** Chave do mapa de custos por (empresa, item). */
export const chaveCustoEmpresa = (empresaId: string, itemId: string) => `${empresaId}|${itemId}`;

/**
 * Custos próprios em lote para pares (empresa, item) — ESTRITO: ausência no
 * mapa significa "a empresa não tem custo registrado para esse item" (sem
 * custo), nunca o CMPM global de outra empresa.
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
  opts?: { incluirAcabado?: boolean },
): Promise<number> {
  // Produto Acabado normalmente não tem CMPM (valoração por preço médio de venda).
  // O PCP é a exceção: a produção fornece o custo, então passa incluirAcabado.
  if (!opts?.incluirAcabado) {
    const it = await tx.item.findUnique({ where: { id: itemId }, select: { categoriaEstoque: true } });
    if (it && String(it.categoriaEstoque) === "PRODUTO_ACABADO") return 0;
  }

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
