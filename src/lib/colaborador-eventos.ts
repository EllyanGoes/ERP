// Histórico funcional do colaborador: rótulos e efeitos colaterais dos eventos
// (DEMISSAO/ADMISSAO mantêm as datas do cadastro; DEMISSAO inativa e encerra a
// função SST). Vale para criar, editar e excluir — excluir desfaz o efeito.
import type { Prisma, TipoEventoColaborador } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export const TIPOS_EVENTO: Record<TipoEventoColaborador, { label: string; periodo: boolean }> = {
  ADMISSAO: { label: "Admissão", periodo: false },
  DEMISSAO: { label: "Demissão", periodo: false },
  AFASTAMENTO: { label: "Afastamento", periodo: true },
  FERIAS: { label: "Férias", periodo: true },
  MUDANCA_CARGO: { label: "Mudança de cargo", periodo: false },
  MUDANCA_SETOR: { label: "Mudança de setor", periodo: false },
  ADVERTENCIA: { label: "Advertência", periodo: false },
  SUSPENSAO: { label: "Suspensão", periodo: true },
  OUTRO: { label: "Outro", periodo: false },
};

/** Motivos (subtipo) por tipo de evento. */
export const MOTIVOS_EVENTO: Partial<Record<TipoEventoColaborador, Record<string, string>>> = {
  AFASTAMENTO: {
    INSS_DOENCA: "Benefício INSS — doença (auxílio por incapacidade)",
    ACIDENTE_TRABALHO: "Acidente de trabalho (B91)",
    MATERNIDADE: "Licença-maternidade",
    PATERNIDADE: "Licença-paternidade",
    ATESTADO: "Atestado médico (até 15 dias)",
    LICENCA: "Licença não remunerada",
    OUTRO: "Outro",
  },
  DEMISSAO: {
    SEM_JUSTA_CAUSA: "Dispensa sem justa causa",
    PEDIDO: "Pedido de demissão",
    JUSTA_CAUSA: "Dispensa por justa causa",
    ACORDO: "Acordo (art. 484-A)",
    FIM_CONTRATO: "Término de contrato (experiência/prazo)",
    FALECIMENTO: "Falecimento",
    OUTRO: "Outro",
  },
};

export const TIPOS_VALIDOS = Object.keys(TIPOS_EVENTO) as TipoEventoColaborador[];

/** Aplica o efeito do evento no cadastro (chamar após criar/editar). */
export async function aplicarEvento(tx: Tx, ev: { colaboradorId: string; tipo: TipoEventoColaborador; data: Date }) {
  if (ev.tipo === "ADMISSAO") {
    await tx.colaborador.update({ where: { id: ev.colaboradorId }, data: { dataAdmissao: ev.data } });
  }
  if (ev.tipo === "DEMISSAO") {
    await tx.colaborador.update({ where: { id: ev.colaboradorId }, data: { dataDemissao: ev.data, ativo: false } });
    // Função SST vigente termina no desligamento (o SST passa a cobrar só o ASO demissional).
    await tx.sstColaboradorFuncao.updateMany({ where: { colaboradorId: ev.colaboradorId, fim: null }, data: { fim: ev.data } });
  }
}

/** Desfaz o efeito ao excluir o evento (se ainda é o que está no cadastro). */
export async function reverterEvento(tx: Tx, ev: { colaboradorId: string; tipo: TipoEventoColaborador; data: Date }) {
  const c = await tx.colaborador.findUnique({ where: { id: ev.colaboradorId }, select: { dataAdmissao: true, dataDemissao: true } });
  if (!c) return;
  const mesmoDia = (a: Date | null) => !!a && a.toISOString().slice(0, 10) === ev.data.toISOString().slice(0, 10);
  if (ev.tipo === "ADMISSAO" && mesmoDia(c.dataAdmissao)) {
    await tx.colaborador.update({ where: { id: ev.colaboradorId }, data: { dataAdmissao: null } });
  }
  if (ev.tipo === "DEMISSAO" && mesmoDia(c.dataDemissao)) {
    await tx.colaborador.update({ where: { id: ev.colaboradorId }, data: { dataDemissao: null, ativo: true } });
  }
}

/** Afastamento em aberto na data (sem fim, ou fim depois de `hoje`). */
export function afastamentoAberto<T extends { tipo: string; data: Date; dataFim: Date | null }>(eventos: T[], hoje = new Date()): T | null {
  return eventos.find((e) => e.tipo === "AFASTAMENTO" && e.data.getTime() <= hoje.getTime() && (!e.dataFim || e.dataFim.getTime() > hoje.getTime())) ?? null;
}
