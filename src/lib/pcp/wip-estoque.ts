// Helpers para postar movimentação de WIP no estoque a partir da produção.
// Reaproveita a maquinaria de estoque existente (EstoqueItem + MovimentacaoEstoque),
// criando automaticamente os itens de WIP (por produto × estado) e um local "Produção".

import type { Prisma, EstadoWIP, TipoMovimentacaoEstoque, CategoriaEstoque } from "@prisma/client";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
// Estoque de embalagem da PRODUÇÃO: o que o almoxarife libera p/ a produção. O
// apontamento que consome embalagem (palete/fita/grampo) baixa DAQUI — então a
// produção só consome o que foi liberado (saldo zero barra o apontamento). Constante
// em módulo client-safe (reexportada aqui p/ não quebrar imports existentes).
import { LOCAL_EMBALAGEM_PRODUCAO_NOME } from "@/lib/locais-producao";
export { LOCAL_EMBALAGEM_PRODUCAO_NOME };

const LOCAL_WIP_NOME = "Produção (WIP)";
const LOCAL_PA_NOME = "Estoque de Produto Acabado";

const ESTADO_LABEL: Record<EstadoWIP, string> = {
  UMIDO: "úmido",
  SECO: "seco",
  QUEIMADO: "queimado",
  ACABADO: "acabado",
};

/** Get-or-create de um local de estoque por nome. */
async function getOrCreateLocalNome(tx: Prisma.TransactionClient, nome: string, descricao: string, categoriasAceitas?: CategoriaEstoque[]): Promise<string> {
  const existente = await tx.localEstoque.findFirst({ where: { nome }, select: { id: true } });
  if (existente) return existente.id;
  const novo = await tx.localEstoque.create({ data: { nome, descricao, categoriasAceitas: categoriasAceitas ?? [] }, select: { id: true } });
  return novo.id;
}

/** Local genérico de WIP (subproduto/resíduo sem estado). */
export async function getOrCreateLocalProducao(tx: Prisma.TransactionClient): Promise<string> {
  return getOrCreateLocalNome(tx, LOCAL_WIP_NOME, "Estoque de produto em processo (gerado pela produção)");
}

/**
 * Local de estoque por estado do WIP — cada estado é uma conta de estoque distinta,
 * para o razão refletir o fluxo úmido→seco→queimado→acabado (D/C por fase).
 * ACABADO cai num local de produto acabado (sellável).
 */
export async function getOrCreateLocalEstado(tx: Prisma.TransactionClient, estado: EstadoWIP): Promise<string> {
  if (estado === "ACABADO") return getOrCreateLocalNome(tx, LOCAL_PA_NOME, "Estoque de produto acabado (produção)");
  // Categoria WIP: na contabilidade todos os locais de fase rolam para a conta
  // PEP-MD (estágio é dimensão, não conta) — ver contabilizarProducaoOrdem.
  return getOrCreateLocalNome(tx, `Produção — WIP ${ESTADO_LABEL[estado] ?? estado}`, "Estoque de produto em processo (produção)", ["WIP"]);
}

function slug(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toUpperCase()
      .slice(0, 24) || "PROD"
  );
}

/** Item de WIP por produto × estado (get-or-create). Não vendável, tipo PRODUTO. */
export async function getOrCreateWipItem(
  tx: Prisma.TransactionClient,
  base: { codigo: string; descricao: string },
  estado: EstadoWIP,
): Promise<string> {
  const codigo = `WIP-${slug(base.codigo)}-${estado}`;
  const existente = await tx.item.findUnique({ where: { codigo }, select: { id: true } });
  if (existente) return existente.id;
  const novo = await tx.item.create({
    data: {
      codigo,
      descricao: `WIP ${base.descricao} — ${ESTADO_LABEL[estado]}`,
      precoVenda: 0,
      tipo: "PRODUTO",
      vendavel: false,
      ativo: true,
    },
    select: { id: true },
  });
  return novo.id;
}

/** Local do estoque de embalagem da PRODUÇÃO (get-or-create). Aceita só EMBALAGEM. */
export async function getOrCreateLocalEmbalagemProducao(tx: Prisma.TransactionClient): Promise<string> {
  return getOrCreateLocalNome(tx, LOCAL_EMBALAGEM_PRODUCAO_NOME, "Embalagem liberada pelo almoxarifado p/ a produção", ["EMBALAGEM"]);
}

/**
 * Local de onde um insumo é consumido: o local próprio com maior saldo.
 * Sem estoque em local nenhum, cai no local genérico de produção.
 */
export async function resolveLocalInsumo(tx: Prisma.TransactionClient, itemId: string): Promise<string> {
  const linhas = await tx.estoqueItem.findMany({
    where: { itemId, clienteDonoId: null, localEstoqueId: { not: null } },
    select: { localEstoqueId: true, quantidadeAtual: true },
  });
  if (linhas.length) {
    linhas.sort((a, b) => parseFloat(b.quantidadeAtual.toString()) - parseFloat(a.quantidadeAtual.toString()));
    return linhas[0].localEstoqueId as string;
  }
  return getOrCreateLocalProducao(tx);
}

/** Cria um lote de movimentação (agrupa a saída + entrada de uma transição). */
export async function getOrCreateLoteProducao(
  tx: Prisma.TransactionClient,
  documento: string,
  observacoes: string,
): Promise<string> {
  const year = new Date().getFullYear();
  const seq = await tx.sequencia.upsert({
    where: { empresaId_prefixo: { empresaId: EMPRESA_PADRAO_ID, prefixo: "MOV" } },
    create: { prefixo: "MOV", ultimo: 1 },
    update: { ultimo: { increment: 1 } },
  });
  const numero = `MOV-${year}-${String(seq.ultimo).padStart(4, "0")}`;
  const lote = await tx.loteMovimentacao.create({
    data: { numero, tipo: "TRANSFERENCIA", documento, observacoes },
    select: { id: true },
  });
  return lote.id;
}

/** Posta um movimento (ENTRADA/SAIDA) atualizando o saldo do EstoqueItem. */
export async function postMovimento(
  tx: Prisma.TransactionClient,
  args: {
    itemId: string;
    localEstoqueId: string;
    tipo: TipoMovimentacaoEstoque;
    quantidade: number;
    ordemProducaoId: string;
    documento: string;
    observacoes: string;
    loteId?: string | null;
    valorUnitario?: number | null; // custo unitário da movimentação (custeio por fase)
  },
): Promise<void> {
  let estoque = await tx.estoqueItem.findFirst({
    where: { itemId: args.itemId, localEstoqueId: args.localEstoqueId, clienteDonoId: null },
  });
  if (!estoque) {
    estoque = await tx.estoqueItem.create({
      data: { itemId: args.itemId, localEstoqueId: args.localEstoqueId, quantidadeAtual: 0, quantidadeMin: 0, clienteDonoId: null },
    });
  }
  const saldoAntes = parseFloat(estoque.quantidadeAtual.toString());
  const delta = args.tipo === "SAIDA" ? -args.quantidade : args.quantidade;
  const saldoDepois = saldoAntes + delta;
  await tx.estoqueItem.update({ where: { id: estoque.id }, data: { quantidadeAtual: saldoDepois } });
  await tx.movimentacaoEstoque.create({
    data: {
      itemId: args.itemId,
      localEstoqueId: args.localEstoqueId,
      tipo: args.tipo,
      quantidade: args.quantidade,
      saldoAntes,
      saldoDepois,
      valorUnitario: args.valorUnitario ?? null,
      documento: args.documento,
      observacoes: args.observacoes,
      ordemProducaoId: args.ordemProducaoId,
      loteId: args.loteId ?? null,
      criadoPor: "Produção",
    },
  });
}
