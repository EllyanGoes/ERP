import sql from "mssql";
import { getEngemanConfig, getCorretivoCodes, inList } from "@/lib/engeman";

// Agregado mensal de um ativo, vindo do Engeman.
export interface AgregadoMensalAtivo {
  codApl: number;
  tag: string;
  descricao: string;
  numeroFalhas: number; // OS corretivas com defeito registrado no mês
  horasParada: number; // parada não planejada (h)
  falhasComCarimbo: number; // quantas usaram MAQPAR→MAQFUN (resto = HOREXEREA estimado)
}

/** Dias do mês (mes de 1 a 12). */
export function diasNoMes(ano: number, mes: number): number {
  // mes é 1-based; em JS o índice é 0-based, então (ano, mes, 0) = último dia do mês `mes`.
  return new Date(ano, mes, 0).getDate();
}

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
 * Agregado mensal por ativo do Engeman: nº de falhas (OS corretivas com defeito
 * registrado) e horas de parada não planejada (MAQPAR→MAQFUN; fallback HOREXEREA).
 * Mesma definição usada em src/app/api/pcm/indicadores/route.ts (CTE FALHAS), aqui
 * agrupada por CODAPL dentro do mês. Usa EXISTS (em vez de JOIN com REGSERV) para
 * não multiplicar a linha quando a OS tem mais de um defeito. Lança se o Engeman
 * estiver inacessível (o chamador trata como 503).
 */
export async function getAgregadoMensalEngeman(
  ano: number,
  mes: number,
  codApls?: number[],
): Promise<AgregadoMensalAtivo[]> {
  const pool = await sql.connect(await getEngemanConfig());
  try {
    const codAplList = codApls && codApls.length > 0 ? codApls.join(",") : null;
    // "Falha" = OS de TIPO corretivo (configurável via pcm_tipos_corretivos), em vez
    // de "tem defeito registrado". Inspeção/preventiva deixam de descontar.
    const corretivosIn = inList(await getCorretivoCodes(pool));
    const result = await pool
      .request()
      .input("ano", sql.Int, ano)
      .input("mes", sql.Int, mes)
      .input("codAplList", sql.VarChar(sql.MAX), codAplList)
      .query<{
        CODAPL: number;
        TAG: string;
        DESCRICAO: string;
        NUMERO_FALHAS: number;
        HORAS_PARADA: number;
        COM_CARIMBO: number;
      }>(`
        SELECT
          o.CODAPL,
          RTRIM(ISNULL(a.TAG, CAST(o.CODAPL AS VARCHAR(20)))) AS TAG,
          RTRIM(ISNULL(a.DESCRICAO, 'Sem descrição'))          AS DESCRICAO,
          COUNT(*) AS NUMERO_FALHAS,
          SUM(
            (CASE WHEN o.MAQPAR IS NOT NULL AND o.MAQFUN IS NOT NULL
              THEN ABS(DATEDIFF(MINUTE, o.MAQPAR, o.MAQFUN)) / 60.0
              ELSE ISNULL(o.HOREXEREA, 0)
            END)
            -- + paradas adicionais (ORDXPAR): janela MAQPAR→MAQFUN, fallback HORINTPARAD
            + ISNULL((
                SELECT SUM(CASE WHEN xp.MAQPAR IS NOT NULL AND xp.MAQFUN IS NOT NULL
                    THEN ABS(DATEDIFF(MINUTE, xp.MAQPAR, xp.MAQFUN)) / 60.0
                    ELSE ISNULL(xp.HORINTPARAD, 0) END)
                FROM ORDXPAR xp WHERE xp.CODORD = o.CODORD), 0)
          ) AS HORAS_PARADA,
          SUM(CASE WHEN o.MAQPAR IS NOT NULL AND o.MAQFUN IS NOT NULL THEN 1 ELSE 0 END) AS COM_CARIMBO
        FROM ORDSERV o
        LEFT JOIN APLIC a ON a.CODAPL = o.CODAPL
        WHERE o.CODAPL IS NOT NULL
          AND o.CODFIL NOT IN (0)
          AND YEAR(o.DATPRO) = @ano
          AND MONTH(o.DATPRO) = @mes
          AND o.CODTIPMAN IN ${corretivosIn}
          AND (@codAplList IS NULL OR o.CODAPL IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@codAplList, ',')))
        GROUP BY o.CODAPL, a.TAG, a.DESCRICAO
      `);
    return result.recordset.map((r) => ({
      codApl: r.CODAPL,
      tag: r.TAG ?? String(r.CODAPL),
      descricao: r.DESCRICAO ?? "",
      numeroFalhas: r.NUMERO_FALHAS ?? 0,
      horasParada: parseFloat((r.HORAS_PARADA ?? 0).toFixed(2)),
      falhasComCarimbo: r.COM_CARIMBO ?? 0,
    }));
  } finally {
    await pool.close();
  }
}
