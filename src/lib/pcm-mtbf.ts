import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dataReferenciaOS, horasParada, wherePeriodoOS } from "@/lib/manutencao/consultas";

// Agregado mensal de um ativo, a partir das OS nativas (ManutOrdem).
export interface AgregadoMensalAtivo {
  ativoId: string;
  codApl: number;
  tag: string;
  descricao: string;
  numeroFalhas: number; // OS de tipo que conta como falha no mês
  horasParada: number; // parada não planejada (h) = janelas de máquina parada
  falhasComCarimbo: number; // quantas têm parada início→fim (resto = sem janela de parada)
}

/** Dias do mês (mes de 1 a 12). */
export function diasNoMes(ano: number, mes: number): number {
  // mes é 1-based; em JS o índice é 0-based, então (ano, mes, 0) = último dia do mês `mes`.
  return new Date(ano, mes, 0).getDate();
}

/**
 * Janela do mês em UTC: [inicio, fim] (fim = último ms do mês). As datas do
 * histórico do Engeman foram gravadas "como UTC" (o mssql lê DATETIME sem fuso
 * como UTC), então YEAR/MONTH(DATPRO) do Engeman = mês UTC aqui.
 */
export function janelaMesUTC(ano: number, mes: number): { inicio: Date; fim: Date; fimExclusivo: Date } {
  const inicio = new Date(Date.UTC(ano, mes - 1, 1));
  const fimExclusivo = new Date(Date.UTC(ano, mes, 1));
  return { inicio, fim: new Date(fimExclusivo.getTime() - 1), fimExclusivo };
}

/**
 * OS que entram na parada não planejada / nº de falhas do MTBF: tipo marcado
 * como falha (ManutTipo.contaComoFalha, antigo pcm_tipos_corretivos) e não
 * cancelada. NÃO exige sintoma (mesma regra do fechamento do Engeman: conta o
 * TIPO corretivo, não "tem defeito registrado").
 */
export const WHERE_FALHA_MTBF: Prisma.ManutOrdemWhereInput = {
  status: { not: "CANCELADA" },
  tipo: { contaComoFalha: true },
};

/**
 * MTBF (definição MaintainX): (tempo de funcionamento − parada não planejada) / nº de falhas.
 * Retorna null quando não há falhas (MTBF indefinido).
 */
export function calcMtbf(
  horasFuncionamento: number,
  horasParada: number,
  numeroFalhas: number,
): number | null {
  if (!numeroFalhas || numeroFalhas <= 0) return null;
  return Math.max(horasFuncionamento - horasParada, 0) / numeroFalhas;
}

/**
 * MTTR (definição MaintainX): parada não planejada / nº de falhas.
 * Retorna null quando não há falhas.
 */
export function calcMttr(horasParada: number, numeroFalhas: number): number | null {
  if (!numeroFalhas || numeroFalhas <= 0) return null;
  return horasParada / numeroFalhas;
}

/**
 * Agregado mensal por ativo: nº de falhas (OS de tipo que conta como falha,
 * configurável em ManutTipo.contaComoFalha) e horas de parada não planejada.
 * A parada vem SÓ da janela de máquina parada da OS (paradaInicio→paradaFim) —
 * NÃO usa horas apontadas (homem-hora, pode se sobrepor entre técnicos).
 * Sem carimbo de parada, a OS entra com 0h (e é sinalizada para revisão).
 * O mês é o da data de referência da OS (programadaPara, senão createdAt).
 * `ativoIds` restringe a ativos específicos (ManutAtivo.id).
 */
export async function getAgregadoMensal(
  ano: number,
  mes: number,
  ativoIds?: string[],
): Promise<AgregadoMensalAtivo[]> {
  const { inicio, fim } = janelaMesUTC(ano, mes);
  const ordens = await prisma.manutOrdem.findMany({
    where: {
      AND: [
        WHERE_FALHA_MTBF,
        wherePeriodoOS(inicio, fim),
        ativoIds && ativoIds.length > 0 ? { ativoId: { in: ativoIds } } : { ativoId: { not: null } },
      ],
    },
    select: {
      programadaPara: true,
      createdAt: true,
      paradaInicio: true,
      paradaFim: true,
      ativo: { select: { id: true, codApl: true, tag: true, nome: true } },
    },
  });

  const porAtivo = new Map<string, AgregadoMensalAtivo>();
  for (const o of ordens) {
    if (!o.ativo) continue;
    // defesa extra: a data de referência precisa cair no mês
    const ref = dataReferenciaOS(o);
    if (ref < inicio || ref > fim) continue;
    let acc = porAtivo.get(o.ativo.id);
    if (!acc) {
      acc = {
        ativoId: o.ativo.id,
        codApl: o.ativo.codApl,
        tag: o.ativo.tag || String(o.ativo.codApl),
        descricao: o.ativo.nome || "Sem descrição",
        numeroFalhas: 0,
        horasParada: 0,
        falhasComCarimbo: 0,
      };
      porAtivo.set(o.ativo.id, acc);
    }
    acc.numeroFalhas += 1;
    acc.horasParada += horasParada(o);
    if (o.paradaInicio && o.paradaFim) acc.falhasComCarimbo += 1;
  }

  return Array.from(porAtivo.values()).map((a) => ({
    ...a,
    horasParada: parseFloat(a.horasParada.toFixed(2)),
  }));
}
