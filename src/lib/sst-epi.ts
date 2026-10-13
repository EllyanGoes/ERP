// Entrega de EPI — regra compartilhada entre a entrega avulsa/lote e a ficha
// por colaborador: saída de estoque opcional (hard block sem saldo) e o
// controle de prazo (vida útil) que exige motivo p/ nova retirada antecipada.
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type EpiBasico = { id: string; nome: string; vidaUtilDias: number | null; itemId: string | null; item: { descricao: string } | null };

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
}) {
  const quantidade = Math.max(1, p.quantidade || 1);
  const vencimentoUso = p.tipo !== "DEVOLUCAO" && p.epi.vidaUtilDias ? new Date(p.data.getTime() + p.epi.vidaUtilDias * 86_400_000) : null;
  let movimentacaoEstoqueId: string | null = null;
  if (p.tipo !== "DEVOLUCAO" && p.epi.itemId && p.localEstoqueId) {
    const estoque = await tx.estoqueItem.findFirst({
      where: { empresaId: p.empresaId, itemId: p.epi.itemId, localEstoqueId: p.localEstoqueId, clienteDonoId: null },
      select: { id: true, quantidadeAtual: true },
    });
    const saldo = Number(estoque?.quantidadeAtual ?? 0);
    if (!estoque || saldo < quantidade) {
      throw new Error(`Sem saldo de "${p.epi.item?.descricao ?? p.epi.nome}" no local escolhido (saldo ${saldo}, precisa ${quantidade}).`);
    }
    await tx.estoqueItem.update({ where: { id: estoque.id }, data: { quantidadeAtual: saldo - quantidade } });
    const colab = await tx.colaborador.findUnique({ where: { id: p.colaboradorId }, select: { nome: true } });
    const mov = await tx.movimentacaoEstoque.create({
      data: {
        empresaId: p.empresaId, itemId: p.epi.itemId, tipo: "SAIDA", quantidade, saldoAntes: saldo, saldoDepois: saldo - quantidade,
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
    },
    include: { epi: { select: { id: true, nome: true, ca: true, vidaUtilDias: true, itemId: true } }, colaborador: { select: { id: true, nome: true } } },
  });
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
  colaborador: { select: { id: true, nome: true, cpf: true, rg: true, matricula: true, cargo: true, dataAdmissao: true, setor: { select: { nome: true } }, sstFuncoes: { where: { fim: null }, take: 1, select: { funcao: { select: { nome: true } } } } } },
  itens: { orderBy: { createdAt: "asc" as const }, include: { epi: { select: { id: true, nome: true, ca: true, vidaUtilDias: true } } } },
};

/** Próximo número da ficha na empresa. */
export async function proximoNumeroFicha(tx: Tx, empresaId: string) {
  const ult = await tx.sstEpiFicha.aggregate({ where: { empresaId }, _max: { numero: true } });
  return (ult._max.numero ?? 0) + 1;
}
