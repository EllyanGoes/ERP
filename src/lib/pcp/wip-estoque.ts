// Helpers para postar movimentação de WIP no estoque a partir da produção.
// Reaproveita a maquinaria de estoque existente (EstoqueItem + MovimentacaoEstoque),
// criando automaticamente os itens de WIP (por produto × estado) e um local "Produção".

import type { Prisma, EstadoWIP, TipoMovimentacaoEstoque } from "@prisma/client";

const LOCAL_WIP_NOME = "Produção (WIP)";

const ESTADO_LABEL: Record<EstadoWIP, string> = {
  UMIDO: "úmido",
  SECO: "seco",
  QUEIMADO: "queimado",
  ACABADO: "acabado",
};

/** Local de estoque único onde o WIP de produção fica (get-or-create por nome). */
export async function getOrCreateLocalProducao(tx: Prisma.TransactionClient): Promise<string> {
  const existente = await tx.localEstoque.findFirst({ where: { nome: LOCAL_WIP_NOME }, select: { id: true } });
  if (existente) return existente.id;
  const novo = await tx.localEstoque.create({
    data: { nome: LOCAL_WIP_NOME, descricao: "Estoque de produto em processo (gerado pela produção)" },
    select: { id: true },
  });
  return novo.id;
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

/** Cria um lote de movimentação (agrupa a saída + entrada de uma transição). */
export async function getOrCreateLoteProducao(
  tx: Prisma.TransactionClient,
  documento: string,
  observacoes: string,
): Promise<string> {
  const year = new Date().getFullYear();
  const seq = await tx.sequencia.upsert({
    where: { prefixo: "MOV" },
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
  },
): Promise<void> {
  let estoque = await tx.estoqueItem.findFirst({
    where: { itemId: args.itemId, localEstoqueId: args.localEstoqueId },
  });
  if (!estoque) {
    estoque = await tx.estoqueItem.create({
      data: { itemId: args.itemId, localEstoqueId: args.localEstoqueId, quantidadeAtual: 0, quantidadeMin: 0 },
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
      documento: args.documento,
      observacoes: args.observacoes,
      ordemProducaoId: args.ordemProducaoId,
      loteId: args.loteId ?? null,
      criadoPor: "Produção",
    },
  });
}
