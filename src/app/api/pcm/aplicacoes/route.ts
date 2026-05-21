export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import sql from "mssql";
import { getEngemanConfig } from "@/lib/engeman";

export interface AplicacaoNode {
  codApl: number;
  tag: string;       // coluna TAG do APLIC (ex.: "CRX-0003")
  descricao: string;
  ativo: boolean;
}

export interface GrupoNode {
  gruTag: string;    // TAG da aplicação-grupo (ex.: "PLF-0000")
  descricao: string; // DESCRICAO da aplicação-grupo (ex.: "PLANTA FABRIL")
  equips: AplicacaoNode[];
}

// Mantido por compatibilidade — não é mais usado internamente
export interface LocalNode {
  codLocapl: number | null;
  descricao: string;
  equips: AplicacaoNode[];
}

export interface AplicacoesResponse {
  grupos: GrupoNode[];
  total: number;
  source: "db";
}

export async function GET() {
  try {
    const pool = await sql.connect(await getEngemanConfig());

    // Busca todas as aplicações ativas com:
    //   TAG e DESCRICAO para identificação
    //   Grupo raiz determinado pelo prefixo da TAGGRU (ex.: "001.")
    //   Join com a aplicação-grupo (GRUAPL='S') que tem esse prefixo como TAGGRU
    const result = await pool.request().query<{
      CODAPL: number;
      TAG: string;
      DESCRICAO: string;
      ATIVO: string;
      GRU_TAG: string;
      GRU_NOME: string;
    }>(`
      SELECT
        a.CODAPL,
        RTRIM(ISNULL(a.TAG, CAST(a.CODAPL AS VARCHAR(20))))   AS TAG,
        RTRIM(ISNULL(a.DESCRICAO, 'Sem descrição'))           AS DESCRICAO,
        ISNULL(a.ATIVO, 'N')                                  AS ATIVO,
        ISNULL(RTRIM(g.TAG),       'SEM-GRU')                 AS GRU_TAG,
        ISNULL(RTRIM(g.DESCRICAO), 'Sem Agrupamento')         AS GRU_NOME
      FROM APLIC a
      /* Encontra o grupo raiz: aplicação com GRUAPL='S' cujo TAGGRU
         é o primeiro segmento do TAGGRU da aplicação filho (ex.: "001.") */
      LEFT JOIN APLIC g
        ON  g.GRUAPL = 'S'
        AND a.TAGGRU IS NOT NULL
        AND g.TAGGRU = LEFT(a.TAGGRU, CHARINDEX('.', a.TAGGRU))
      WHERE a.ATIVO = 'S'
      ORDER BY GRU_NOME, a.TAG
    `);

    await pool.close();

    const map = new Map<string, GrupoNode>();
    for (const r of result.recordset) {
      const key = r.GRU_TAG;
      if (!map.has(key)) {
        map.set(key, { gruTag: r.GRU_TAG, descricao: r.GRU_NOME, equips: [] });
      }
      map.get(key)!.equips.push({
        codApl:   r.CODAPL,
        tag:      r.TAG,
        descricao: r.DESCRICAO,
        ativo:    r.ATIVO === "S",
      });
    }

    // "Sem Agrupamento" vai por último
    const grupos = Array.from(map.values()).sort((a, b) => {
      if (a.gruTag === "SEM-GRU") return 1;
      if (b.gruTag === "SEM-GRU") return -1;
      return a.descricao.localeCompare(b.descricao);
    });

    return NextResponse.json({
      grupos,
      total: result.recordset.length,
      source: "db",
    } satisfies AplicacoesResponse);
  } catch (err) {
    console.error("[PCM /api/pcm/aplicacoes] Engeman inacessível:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Engeman inacessível" }, { status: 503 });
  }
}
