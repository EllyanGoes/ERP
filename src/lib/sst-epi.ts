// Entrega de EPI — regra compartilhada entre a entrega avulsa/lote e a ficha
// por colaborador: saída de estoque opcional (hard block sem saldo; obrigatória
// p/ EPI descartável), o controle de prazo (vida útil) que exige motivo p/ nova
// retirada antecipada (descartável fica de fora) e a ficha de histórico aberta.
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type EpiBasico = {
  id: string; nome: string; vidaUtilDias: number | null; itemId: string | null; item: { descricao: string } | null; descartavel?: boolean; ca?: string | null;
  itens?: { itemId: string; tamanho: string | null; ca?: string | null; item: { descricao: string } }[];
};

/** Select do EPI usado pelas rotas de entrega (inclui os tamanhos). */
export const EPI_ENTREGA_SELECT = {
  id: true, nome: true, vidaUtilDias: true, itemId: true, descartavel: true, ca: true, item: { select: { descricao: true } },
  itens: { orderBy: [{ ordem: "asc" as const }, { tamanho: "asc" as const }], select: { itemId: true, tamanho: true, ca: true, item: { select: { descricao: true } } } },
};

/**
 * Tamanho → item de estoque. EPI sem tamanhos usa o item único; com um só
 * tamanho, ele é implícito; com vários, o tamanho (ou o item) tem de vir —
 * senão não há como saber qual item baixar.
 */
export function resolverTamanho(epi: EpiBasico, escolha: { tamanho?: string | null; itemId?: string | null }) {
  const itens = epi.itens ?? [];
  if (itens.length === 0) return { itemId: epi.itemId, tamanho: escolha.tamanho?.trim() || null, descricao: epi.item?.descricao ?? null, ca: epi.ca ?? null };
  const t = escolha.tamanho?.trim().toUpperCase() || null;
  const v = (escolha.itemId && itens.find((i) => i.itemId === escolha.itemId))
    || (t && itens.find((i) => (i.tamanho ?? "").toUpperCase() === t))
    || (itens.length === 1 ? itens[0] : null);
  if (!v) return null;
  // CA da variação (cada produto/fabricante tem o seu); vazio = CA do EPI.
  return { itemId: v.itemId, tamanho: v.tamanho ?? escolha.tamanho?.trim() ?? null, descricao: v.item.descricao, ca: v.ca || epi.ca || null };
}

export const TIPOS_ENTREGA = ["ENTREGA", "TROCA", "DEVOLUCAO"] as const;
export type TipoEntrega = (typeof TIPOS_ENTREGA)[number];

/**
 * Retirada antecipada: há entrega/troca vigente desse EPI cujo vencimento de
 * uso (data + vida útil) ainda não chegou. Devolve a entrega que "segura" o
 * prazo ou null quando a retirada é livre. Descartável não tem prazo.
 */
export async function entregaDentroDoPrazo(tx: Tx, colaboradorId: string, epiId: string, data: Date) {
  const epi = await tx.sstEpi.findUnique({ where: { id: epiId }, select: { descartavel: true } });
  if (epi?.descartavel) return null;
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
  // Descartável sai sempre do estoque — "não baixar" foi o erro de out/2026.
  if (p.epi.descartavel && p.tipo !== "DEVOLUCAO" && itemId && !p.localEstoqueId) throw new Error(`"${p.epi.nome}" é descartável: escolha o local de onde baixar do estoque.`);
  // Descartável não tem troca prevista: é consumo, retira quando acaba.
  const vencimentoUso = p.tipo !== "DEVOLUCAO" && !p.epi.descartavel && p.epi.vidaUtilDias ? new Date(p.data.getTime() + p.epi.vidaUtilDias * 86_400_000) : null;
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
      tamanho: variante?.tamanho ?? p.tamanho?.trim() ?? null, itemId, ca: variante?.ca ?? p.epi.ca ?? null,
    },
    include: { epi: { select: { id: true, nome: true, ca: true, vidaUtilDias: true, itemId: true } }, colaborador: { select: { id: true, nome: true } } },
  });
}

/**
 * Um item de estoque pertence a um só EPI ativo. Dois EPIs no mesmo item
 * duplicam entregas e confundem o saldo (capacete verde, out/2026).
 * Devolve a mensagem de erro do 1º conflito ou null.
 */
export async function conflitoItemEpi(tx: Tx, p: { empresaId: string; epiId?: string | null; itemIds: string[] }) {
  const itemIds = Array.from(new Set(p.itemIds.filter(Boolean)));
  if (!itemIds.length) return null;
  const outro = await tx.sstEpiItem.findFirst({
    where: { itemId: { in: itemIds }, epi: { empresaId: p.empresaId, ativo: true, ...(p.epiId ? { id: { not: p.epiId } } : {}) } },
    select: { item: { select: { codigo: true, descricao: true } }, epi: { select: { nome: true } } },
  });
  return outro ? `${outro.item.codigo} ${outro.item.descricao} já está no EPI "${outro.epi.nome}". Um item de estoque só pode estar em um EPI.` : null;
}

/**
 * Grava a grade de tamanhos/cores do EPI, com o CA de cada produto (substitui a anterior). Linhas sem item
 * são ignoradas; item repetido fica com a 1ª linha. Mantém SstEpi.itemId = item
 * do 1º tamanho (compatibilidade).
 */
export type LinhaVariacaoEpi = { itemId?: string | null; tamanho?: string | null; ca?: string | null; caValidade?: string | null; fabricante?: string | null };

export async function salvarTamanhosEpi(tx: Tx, epiId: string, linhas: LinhaVariacaoEpi[]) {
  const vistos = new Set<string>();
  const validas = linhas
    .map((l) => ({
      itemId: String(l.itemId ?? "").trim(), tamanho: String(l.tamanho ?? "").trim().toUpperCase() || null,
      ca: String(l.ca ?? "").trim() || null, caValidade: l.caValidade ? new Date(l.caValidade) : null, fabricante: String(l.fabricante ?? "").trim() || null,
    }))
    .filter((l) => l.itemId && !vistos.has(l.itemId) && vistos.add(l.itemId));
  await tx.sstEpiItem.deleteMany({ where: { epiId } });
  for (let ordem = 0; ordem < validas.length; ordem++) await tx.sstEpiItem.create({ data: { epiId, ...validas[ordem], ordem } });
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
  colaborador: { select: { id: true, nome: true, cpf: true, rg: true, matricula: true, cargo: true, dataAdmissao: true, setor: { select: { id: true, nome: true } }, sstFuncoes: { where: { fim: null }, take: 1, select: { funcao: { select: { nome: true, requisitosEpi: { select: { epi: { select: { nome: true, ca: true } } } } } } } } } },
  itens: { orderBy: [{ data: "asc" as const }, { createdAt: "asc" as const }], include: { epi: { select: { id: true, nome: true, ca: true, vidaUtilDias: true } } } },
};

/**
 * Ficha de histórico aberta do colaborador (cria a próxima quando não há).
 * Uma só por colaborador — índice único parcial no banco como backstop.
 */
export async function fichaHistoricoAberta(tx: Tx, p: { empresaId: string; colaboradorId: string; data: Date; criadoPor: string }) {
  const aberta = await tx.sstEpiFicha.findFirst({ where: { colaboradorId: p.colaboradorId, historico: true, fechadaEm: null }, select: { id: true, numero: true } });
  if (aberta) return { ...aberta, nova: false };
  const numero = await proximoNumeroFicha(tx, p.empresaId);
  const f = await tx.sstEpiFicha.create({ data: { empresaId: p.empresaId, numero, colaboradorId: p.colaboradorId, data: p.data, historico: true, criadoPor: p.criadoPor }, select: { id: true, numero: true } });
  return { ...f, nova: true };
}

/** Próximo número da ficha na empresa. */
export async function proximoNumeroFicha(tx: Tx, empresaId: string) {
  const ult = await tx.sstEpiFicha.aggregate({ where: { empresaId }, _max: { numero: true } });
  return (ult._max.numero ?? 0) + 1;
}
