import { Prisma } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Definições comuns dos relatórios do PCM sobre os dados nativos (substituem as
// consultas SQL ao Engeman). Equivalências do histórico importado:
//   ORDSERV.DATPRO  → ManutOrdem.programadaPara (fallback createdAt = DATENT)
//   ORDSERV.DATFEC  → concluidaEm          STATORD F/C/A → CONCLUIDA/CANCELADA/abertos
//   MAQPAR/MAQFUN   → paradaInicio/paradaFim
//   REGSERV.CODDEF  → ManutOrdemServico.sintomaId (CODCAU → causaId)
//   TIPMANUT corretivo (pcm_tipos_corretivos) → ManutTipo.contaComoFalha
//   SETEXE → ManutEquipe        ORDXFUN → ManutApontamento
//   APLIC.CODAPL → ManutAtivo.codApl (chave de AtivoCriticidade/AtivoRegime/FechamentoMtbf)
// ─────────────────────────────────────────────────────────────────────────────

/** Data de referência da OS nos relatórios (equivale ao DATPRO do Engeman). */
export function dataReferenciaOS(o: { programadaPara: Date | null; createdAt: Date }): Date {
  return o.programadaPara ?? o.createdAt;
}

/** Filtro Prisma de OS no período pela data de referência. */
export function wherePeriodoOS(inicio?: Date | null, fim?: Date | null): Prisma.ManutOrdemWhereInput {
  if (!inicio && !fim) return {};
  const faixa: Prisma.DateTimeFilter = {};
  if (inicio) faixa.gte = inicio;
  if (fim) faixa.lte = fim;
  return {
    OR: [
      { programadaPara: faixa },
      { programadaPara: null, createdAt: faixa },
    ],
  };
}

/**
 * FALHA = OS não cancelada, de tipo que conta como falha, com ao menos um
 * serviço com sintoma (mesma regra do Engeman: corretiva + REGSERV.CODDEF).
 */
export const WHERE_FALHA: Prisma.ManutOrdemWhereInput = {
  status: { not: "CANCELADA" },
  tipo: { contaComoFalha: true },
  servicos: { some: { sintomaId: { not: null } } },
};

/** Horas de parada da OS (0 se sem carimbo ou incompleto). */
export function horasParada(o: { paradaInicio: Date | null; paradaFim: Date | null }): number {
  if (!o.paradaInicio || !o.paradaFim) return 0;
  return Math.max(0, (o.paradaFim.getTime() - o.paradaInicio.getTime()) / 3_600_000);
}

/** Status "abertos" para quadros e backlog. */
export const STATUS_ABERTOS = ["ABERTA", "PLANEJADA", "EM_EXECUCAO", "PAUSADA", "AGUARDANDO_MATERIAL", "AGUARDANDO_TERCEIRO", "ENCERRADA"];
