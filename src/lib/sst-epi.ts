// Entrega de EPI — regra compartilhada entre a entrega avulsa/lote e a ficha
// por colaborador: saída de estoque opcional (hard block sem saldo) e o
// controle de prazo (vida útil) que exige motivo p/ nova retirada antecipada.
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type EpiBasico = {
  id: string; nome: string; vidaUtilDias: number | null; itemId: string | null; item: { descricao: string } | null;
  itens?: { itemId: string; tamanho: string | null; item: { descricao: string } }[];
};

/** Select do EPI usado pelas rotas de entrega (inclui os tamanhos). */
export const EPI_ENTREGA_SELECT = {
  id: true, nome: true, vidaUtilDias: true, itemId: true, item: { select: { descricao: true } },
  itens: { orderBy: [{ ordem: "asc" as const }, { tamanho: "asc" as const }], select: { itemId: true, tamanho: true, item: { select: { descricao: true } } } },
};

/**
 * Tamanho → item de estoque. EPI sem tamanhos usa o item único; com um só
 * tamanho, ele é implícito; com vários, o tamanho (ou o item) tem de vir —
 * senão não há como saber qual item baixar.
 */
export function resolverTamanho(epi: EpiBasico, escolha: { tamanho?: string | null; itemId?: string | null }) {
  const itens = epi.itens ?? [];
  if (itens.length === 0) return { itemId: epi.itemId, tamanho: escolha.tamanho?.trim() || null, descricao: epi.item?.descricao ?? null };
  const t = escolha.tamanho?.trim().toUpperCase() || null;
  const v = (escolha.itemId && itens.find((i) => i.itemId === escolha.itemId))
    || (t && itens.find((i) => (i.tamanho ?? "").toUpperCase() === t))
    || (itens.length === 1 ? itens[0] : null);
  if (!v) return null;
  return { itemId: v.itemId, tamanho: v.tamanho ?? escolha.tamanho?.trim() ?? null, descricao: v.item.descricao };
}

export const TIPOS_ENTREGA = ["ENTREGA", "TROCA", "DEVOLUCAO"] as const;
export type TipoEntrega = (typeof TIPOS_ENTREGA)[number];

/**
 * Retirada antecipada: há entrega/troca vigente desse EPI cujo vencimento de
 * uso (data + vida útil) ainda não chegou. Devolve a entrega que "segura" o
 * prazo ou null quando a retirada é livre.
 */
export async function entregaDentroDoPrazo(tx: Tx, colaboradorId: string, epiId: string, data: Date) {
  const ultima = await tx.sstEpiEntrega.findFirst({
    where: { colaboradorId, epiId },
    orderBy: { data: "desc" },
    select: { id: true, tipo: true, data: true, vencimentoUso: true },
  });
  if (!ultima || ultima.tipo === "DEVOLUCAO" || !ultima.vencimentoUso) return null;
  return ultima.vencimentoUso.getTime() > data.getTime() ? ultima : null;
}

/** Cria UMA linha de entrega (com saída de estoque quando pedido). */
export async function registrarEntregaEpi(tx: Tx, p: {
  empresaId: string; colaboradorId: string; epi: EpiBasico; tipo: TipoEntrega; quantidade: number; data: Date;
  motivo: string | null; localEstoqueId: string | null; documentoId: string | null; fichaId: string | null; criadoPor: string;
  tamanho?: string | null; itemId?: string | null;
}) {
  const quantidade = Math.max(1, p.quantidade || 1);
  const variante = resolverTamanho(p.epi, { tamanho: p.tamanho, itemId: p.itemId });
  // Vários tamanhos e nenhum escolhido: só é problema quando há baixa de estoque.
  if (!variante && p.tipo !== "DEVOLUCAO" && p.localEstoqueId) throw new Error(`Escolha o tamanho de "${p.epi.nome}" para baixar do estoque.`);
  const itemId = variante?.itemId ?? null;
  const vencimentoUso = p.tipo !== "DEVOLUCAO" && p.epi.vidaUtilDias ? new Date(p.data.getTime() + p.epi.vidaUtilDias * 86_400_000) : null;
  let movimentacaoEstoqueId: string | null = null;
  if (p.tipo !== "DEVOLUCAO" && itemId && p.localEstoqueId) {
    const estoque = await tx.estoqueItem.findFirst({
      where: { empresaId: p.empresaId, itemId, localEstoqueId: p.localEstoqueId, clienteDonoId: null },
      select: { id: true, quantidadeAtual: true },
    });
    const saldo = Number(estoque?.quantidadeAtual ?? 0);
    if (!estoque || saldo < quantidade) {
      throw new Error(`Sem saldo de "${variante?.descricao ?? p.epi.nome}" no local escolhido (saldo ${saldo}, precisa ${quantidade}).`);
    }
    await tx.estoqueItem.update({ where: { id: estoque.id }, data: { quantidadeAtual: saldo - quantidade } });
    const colab = await tx.colaborador.findUnique({ where: { id: p.colaboradorId }, select: { nome: true } });
    const mov = await tx.movimentacaoEstoque.create({
      data: {
        empresaId: p.empresaId, itemId, tipo: "SAIDA", quantidade, saldoAntes: saldo, saldoDepois: saldo - quantidade,
        localEstoqueId: p.localEstoqueId, data: p.data, documento: "EPI", observacoes: `Entrega de EPI — ${colab?.nome ?? p.colaboradorId}`,
        criadoPor: p.criadoPor,
      },
      select: { id: true },
    });
    movimentacaoEstoqueId = mov.id;
  }
  return tx.sstEpiEntrega.create({
    data: {
      empresaId: p.empresaId, colaboradorId: p.colaboradorId, epiId: p.epi.id, tipo: p.tipo, quantidade, data: p.data,
      motivo: p.motivo, vencimentoUso, movimentacaoEstoqueId, documentoId: p.documentoId, fichaId: p.fichaId, criadoPor: p.criadoPor,
      tamanho: variante?.tamanho ?? p.tamanho?.trim() ?? null, itemId,
    },
    include: { epi: { select: { id: true, nome: true, ca: true, vidaUtilDias: true, itemId: true } }, colaborador: { select: { id: true, nome: true } } },
  });
}

/**
 * Grava a grade de tamanhos do EPI (substitui a anterior). Linhas sem item
 * são ignoradas; item repetido fica com a 1ª linha. Mantém SstEpi.itemId = item
 * do 1º tamanho (compatibilidade).
 */
export async function salvarTamanhosEpi(tx: Tx, epiId: string, linhas: { itemId?: string | null; tamanho?: string | null }[]) {
  const vistos = new Set<string>();
  const validas = linhas
    .map((l) => ({ itemId: String(l.itemId ?? "").trim(), tamanho: String(l.tamanho ?? "").trim().toUpperCase() || null }))
    .filter((l) => l.itemId && !vistos.has(l.itemId) && vistos.add(l.itemId));
  await tx.sstEpiItem.deleteMany({ where: { epiId } });
  for (let ordem = 0; ordem < validas.length; ordem++) await tx.sstEpiItem.create({ data: { epiId, itemId: validas[ordem].itemId, tamanho: validas[ordem].tamanho, ordem } });
  await tx.sstEpi.update({ where: { id: epiId }, data: { itemId: validas[0]?.itemId ?? null } });
}

/** Estorna a saída de estoque de uma entrega (se houve). Não apaga a entrega. */
export async function estornarEstoqueEntrega(tx: Tx, movimentacaoEstoqueId: string | null) {
  if (!movimentacaoEstoqueId) return;
  const mov = await tx.movimentacaoEstoque.findUnique({ where: { id: movimentacaoEstoqueId }, select: { id: true, itemId: true, localEstoqueId: true, quantidade: true, empresaId: true } });
  if (!mov) return;
  const estoque = await tx.estoqueItem.findFirst({ where: { empresaId: mov.empresaId, itemId: mov.itemId, localEstoqueId: mov.localEstoqueId, clienteDonoId: null }, select: { id: true, quantidadeAtual: true } });
  if (estoque) await tx.estoqueItem.update({ where: { id: estoque.id }, data: { quantidadeAtual: Number(estoque.quantidadeAtual) + Number(mov.quantidade) } });
  await tx.movimentacaoEstoque.delete({ where: { id: mov.id } });
}

/** Include da ficha (lista, detalhe e impressão). */
export const FICHA_INCLUDE = {
  colaborador: { select: { id: true, nome: true, cpf: true, rg: true, matricula: true, cargo: true, dataAdmissao: true, setor: { select: { id: true, nome: true } }, sstFuncoes: { where: { fim: null }, take: 1, select: { funcao: { select: { nome: true } } } } } },
  itens: { orderBy: { createdAt: "asc" as const }, include: { epi: { select: { id: true, nome: true, ca: true, vidaUtilDias: true } } } },
};

/** Próximo número da ficha na empresa. */
export async function proximoNumeroFicha(tx: Tx, empresaId: string) {
  const ult = await tx.sstEpiFicha.aggregate({ where: { empresaId }, _max: { numero: true } });
  return (ult._max.numero ?? 0) + 1;
}
