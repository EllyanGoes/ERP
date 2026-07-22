// Helpers para postar movimentação de WIP no estoque a partir da produção.
// Reaproveita a maquinaria de estoque existente (EstoqueItem + MovimentacaoEstoque),
// criando automaticamente os itens de WIP (por produto × estado) e um local "Produção".

import type { Prisma, EstadoWIP, TipoMovimentacaoEstoque, CategoriaEstoque } from "@prisma/client";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { assertSaldoNaoNegativo } from "@/lib/estoque-guard";
// Estoque de embalagem da PRODUÇÃO: o que o almoxarife libera p/ a produção. O
// apontamento que consome embalagem (palete/fita/grampo) baixa DAQUI — então a
// produção só consome o que foi liberado (saldo zero barra o apontamento). Constante
// em módulo client-safe (reexportada aqui p/ não quebrar imports existentes).
// WIP unificado: um único local de produto em processo p/ todos os estados de WIP
// (úmido/seco/queimado) e o fallback genérico. O estado segue como dimensão de ITEM
// (WIP-X-UMIDO/SECO/QUEIMADO), não de local; o contábil já rola tudo p/ PEP-MD
// (1.1.3.0005.0001) em contabilizarProducaoOrdem.
import { LOCAL_EMBALAGEM_PRODUCAO_NOME, LOCAL_PEP_NOME, LOCAL_PA_NOME } from "@/lib/locais-producao";
export { LOCAL_EMBALAGEM_PRODUCAO_NOME };

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

/** Local genérico de WIP (subproduto/resíduo sem estado) — o único PEP. */
export async function getOrCreateLocalProducao(tx: Prisma.TransactionClient): Promise<string> {
  return getOrCreateLocalNome(tx, LOCAL_PEP_NOME, "Estoque de produto em processo (produção)", ["WIP"]);
}

/**
 * Local de estoque do WIP — um ÚNICO "Estoque de Produto em Processo" para todos os
 * estados (úmido/seco/queimado). O estado é dimensão de ITEM, não de local; o
 * contábil rola tudo p/ PEP-MD (1.1.3.0005.0001) em contabilizarProducaoOrdem.
 * ACABADO cai num local de produto acabado (sellável).
 */
export async function getOrCreateLocalEstado(tx: Prisma.TransactionClient, estado: EstadoWIP): Promise<string> {
  if (estado === "ACABADO") return getOrCreateLocalNome(tx, LOCAL_PA_NOME, "Estoque de produto acabado (produção)");
  return getOrCreateLocalNome(tx, LOCAL_PEP_NOME, "Estoque de produto em processo (produção)", ["WIP"]);
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
 * Local de onde um insumo é consumido, alinhado à regra de saída de local-saida.ts:
 * prefere o local cujas `categoriasAceitas` batem com a categoria do item (maior
 * saldo como desempate); sem local compatível, cai em qualquer local com estoque
 * (maior saldo); sem estoque em local nenhum, no local genérico de produção.
 */
export async function resolveLocalInsumo(tx: Prisma.TransactionClient, itemId: string): Promise<string> {
  const [item, linhas] = await Promise.all([
    tx.item.findUnique({ where: { id: itemId }, select: { categoriaEstoque: true } }),
    tx.estoqueItem.findMany({
      where: { itemId, clienteDonoId: null, localEstoqueId: { not: null } },
      select: { localEstoqueId: true, quantidadeAtual: true, localEstoque: { select: { categoriasAceitas: true } } },
    }),
  ]);
  const categoria = (item?.categoriaEstoque ?? null) as CategoriaEstoque | null;
  const aceita = (cats: CategoriaEstoque[]) => cats.length === 0 || (!!categoria && cats.includes(categoria));
  const ordenadas = linhas
    .slice()
    .sort((a, b) => parseFloat(b.quantidadeAtual.toString()) - parseFloat(a.quantidadeAtual.toString()));
  const naCategoria = ordenadas.filter((l) => aceita(l.localEstoque?.categoriasAceitas ?? []));
  if (naCategoria.length) return naCategoria[0].localEstoqueId as string;
  if (ordenadas.length) return ordenadas[0].localEstoqueId as string;
  return getOrCreateLocalProducao(tx);
}

/** Cria um lote de movimentação (agrupa a saída + entrada de uma transição).
 *  `empresaId`: empresa da ORDEM (numeração da sequência); ausente → empresa padrão. */
export async function getOrCreateLoteProducao(
  tx: Prisma.TransactionClient,
  documento: string,
  observacoes: string,
  empresaId?: string | null,
): Promise<string> {
  const year = new Date().getFullYear();
  const seq = await tx.sequencia.upsert({
    where: { empresaId_prefixo: { empresaId: empresaId || EMPRESA_PADRAO_ID, prefixo: "MOV" } },
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
    // Apontamento com estoque insuficiente: o guard vira aviso no front (o usuário
    // confirma e reenvia com o flag) — consumo real aconteceu, saldo ajusta depois.
    permitirSaldoNegativo?: boolean;
  },
): Promise<void> {
  let estoque = await tx.estoqueItem.findFirst({
    where: { itemId: args.itemId, localEstoqueId: args.localEstoqueId, clienteDonoId: null },
    select: { id: true },
  });
  if (!estoque) {
    estoque = await tx.estoqueItem.create({
      data: { itemId: args.itemId, localEstoqueId: args.localEstoqueId, quantidadeAtual: 0, quantidadeMin: 0, clienteDonoId: null },
      select: { id: true },
    });
  }
  const delta = args.tipo === "SAIDA" ? -args.quantidade : args.quantidade;
  // increment/decrement ATÔMICO (sem read-then-write): concorrência não perde saldo.
  const atualizado = await tx.estoqueItem.update({
    where: { id: estoque.id },
    data: { quantidadeAtual: { increment: delta } },
    select: { quantidadeAtual: true },
  });
  const saldoDepois = parseFloat(atualizado.quantidadeAtual.toString());
  const saldoAntes = saldoDepois - delta;
  // Guard de saldo: SAÍDA não pode deixar o saldo negativo. Lançar aqui (dentro da
  // transação) desfaz o increment junto com o resto do apontamento (rollback).
  if (args.tipo === "SAIDA" && saldoDepois < -1e-9 && args.permitirSaldoNegativo !== true) {
    const item = await tx.item.findUnique({ where: { id: args.itemId }, select: { descricao: true } });
    assertSaldoNaoNegativo([{ itemId: args.itemId, descricao: item?.descricao ?? null, saldoAtual: saldoAntes, saldoDepois }]);
  }
  // Data de NEGÓCIO do movimento = dia PLANEJADO da OP (date-only, UTC midnight).
  // Apontamentos retroativos (lançar o backlog de vários dias de uma vez) caem no
  // dia certo do extrato, não no dia do registro (createdAt continua auditando).
  const op = await tx.ordemProducao.findUnique({
    where: { id: args.ordemProducaoId },
    select: { dataPrevistaInicio: true, dataPrevista: true },
  });
  const prevista = op?.dataPrevistaInicio ?? op?.dataPrevista ?? null;
  const dataNegocio = prevista
    ? new Date(Date.UTC(prevista.getUTCFullYear(), prevista.getUTCMonth(), prevista.getUTCDate()))
    : null;
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
      data: dataNegocio,
      criadoPor: "Produção",
    },
  });
}
