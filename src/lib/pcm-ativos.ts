import { prisma } from "@/lib/prisma";

// ── Nó da árvore ────────────────────────────────────────────────────────────────
// Árvore de ativos da Manutenção (ManutAtivo, hierarquia por paiId). Substitui a
// leitura da tabela APLIC do Engeman. `codApl` segue sendo a chave numérica
// estável (= antigo CODAPL) usada por AtivoCriticidade/AtivoRegime/FechamentoMtbf,
// SstMaquina.codApl e CentroTrabalho.codApl.
// `taggru` é mantido por compatibilidade com quem usa o campo como chave de
// expansão/React key: agora carrega o id do ManutAtivo (único).
export interface TreeNode {
  id: string;
  codApl: number;
  tag: string;
  descricao: string;
  /** @deprecated use `id` — mantido igual ao id do ManutAtivo. */
  taggru: string;
  tipo: string;
  ativo: boolean;
  isLeaf: boolean;
  children: TreeNode[];
}

// ── Helpers puros ───────────────────────────────────────────────────────────────

function sortTree(nodes: TreeNode[]) {
  nodes.sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"));
  for (const n of nodes) sortTree(n.children);
}

/** Conta as folhas (equipamentos finais) da árvore. */
export function countLeaves(nodes: TreeNode[]): number {
  return nodes.reduce((s, n) => s + (n.isLeaf ? 1 : countLeaves(n.children)), 0);
}

/** Percorre todos os nós da árvore (pré-ordem). */
export function forEachNode(nodes: TreeNode[], fn: (n: TreeNode) => void) {
  for (const n of nodes) {
    fn(n);
    forEachNode(n.children, fn);
  }
}

/** Lista plana com o caminho (ancestrais) de cada nó — para droplists. */
export function flattenTree(nodes: TreeNode[]): (Omit<TreeNode, "children" | "isLeaf"> & { caminho: string; nivel: number })[] {
  const out: (Omit<TreeNode, "children" | "isLeaf"> & { caminho: string; nivel: number })[] = [];
  const walk = (ns: TreeNode[], trilha: string[]) => {
    for (const n of ns) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { children, isLeaf, ...resto } = n;
      out.push({ ...resto, caminho: trilha.join(" › "), nivel: trilha.length });
      if (children.length) walk(children, [...trilha, n.descricao]);
    }
  };
  walk(nodes, []);
  return out;
}

// ── Busca a árvore de ativos (dados nativos) ─────────────────────────────────────
/**
 * Monta a árvore a partir de ManutAtivo da empresa ativa (escopo automático do
 * proxy). Por padrão só ativos ativos; um filho ativo de pai inativo sobe para a
 * raiz (não some da árvore).
 *
 * A raiz "PLANTA FABRIL" do Engeman NÃO é mais removida: no modelo nativo ela é
 * um ativo comum (tipo LOCAL) que precisa ser editável, e boa parte dos ativos
 * importados já fica fora dela (raízes próprias).
 *
 * Fonte única reusada por GET /api/pcm/aplicacoes, /api/pcm/ativos e SST/PCP.
 */
export async function fetchAtivosTree(opts: { incluirInativos?: boolean } = {}): Promise<TreeNode[]> {
  const rows = await prisma.manutAtivo.findMany({
    where: opts.incluirInativos ? {} : { ativo: true },
    select: { id: true, codApl: true, tag: true, nome: true, tipo: true, paiId: true, ativo: true },
    orderBy: [{ nome: "asc" }],
  });

  // 1. mapa de nós por id
  const nodeMap = new Map<string, TreeNode>();
  for (const r of rows) {
    nodeMap.set(r.id, {
      id: r.id,
      codApl: r.codApl,
      tag: r.tag,
      descricao: r.nome,
      taggru: r.id,
      tipo: r.tipo,
      ativo: r.ativo,
      isLeaf: true,
      children: [],
    });
  }

  // 2. liga pai ↔ filho (pai fora do conjunto → raiz)
  const roots: TreeNode[] = [];
  for (const r of rows) {
    const node = nodeMap.get(r.id)!;
    const parent = r.paiId ? nodeMap.get(r.paiId) : undefined;
    if (parent && parent !== node) {
      parent.isLeaf = false;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // 3. ordena cada nível
  sortTree(roots);
  return roots;
}
