export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import sql from "mssql";
import { getEngemanConfig } from "@/lib/engeman";

export interface AplicacaoNode {
  codApl: number;
  tag: string;       // coluna TAG do APLIC (ex.: "ALI-0001")
  descricao: string;
  ativo: boolean;
}

export interface SubgrupoNode {
  gruTag: string;    // TAG do sub-sistema nível 3 (ex.: "LNP-0001")
  descricao: string; // Nome do sub-sistema  (ex.: "LINHA DE PRODUÇÃO 01")
  equips: AplicacaoNode[];
}

export interface GrupoNode {
  gruTag: string;    // TAG da área nível 2  (ex.: "PRD-0000")
  descricao: string; // Nome da área         (ex.: "ÁREA DE PRODUÇÃO")
  subgrupos: SubgrupoNode[];
}

// Mantido por compatibilidade com imports antigos
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

    // Extrai prefixo de nível 2 (área) e nível 3 (sub-sistema) para cada aplicação
    // e resolve os nomes fazendo join com a própria tabela APLIC.
    //
    // Exemplos de TAGGRU:
    //   '001.'           → nível 1 (raiz – PLF-0000, ignorado)
    //   '001.001.'       → nível 2 = área (PRD-0000)
    //   '001.001.001.'   → nível 3 = sub-sistema (LNP-0001)
    //   '001.001.001.001.002.001.' → folha → grupo em nível 3, sub-sistema em nível 3
    const result = await pool.request().query<{
      CODAPL: number;
      TAG: string;
      DESCRICAO: string;
      ATIVO: string;
      GRU2_TAG: string;
      GRU2_NOME: string;
      GRU3_TAG: string;
      GRU3_NOME: string;
    }>(`
      WITH PREFIXES AS (
        SELECT
          a.CODAPL,
          RTRIM(ISNULL(a.TAG, CAST(a.CODAPL AS VARCHAR(20))))  AS TAG,
          RTRIM(ISNULL(a.DESCRICAO, 'Sem descrição'))          AS DESCRICAO,
          ISNULL(a.ATIVO, 'N')                                 AS ATIVO,

          /* ── Prefixo nível 2 (área): até o 2º ponto ── */
          CASE
            WHEN a.TAGGRU IS NULL THEN NULL
            WHEN CHARINDEX('.', a.TAGGRU, CHARINDEX('.', a.TAGGRU) + 1) > 0
              THEN LEFT(a.TAGGRU, CHARINDEX('.', a.TAGGRU, CHARINDEX('.', a.TAGGRU) + 1))
            ELSE a.TAGGRU   -- nível 1: usa o próprio
          END AS GRU2_PREFIX,

          /* ── Prefixo nível 3 (sub-sistema): até o 3º ponto ── */
          CASE
            WHEN a.TAGGRU IS NULL THEN NULL
            WHEN CHARINDEX('.', a.TAGGRU,
                   CHARINDEX('.', a.TAGGRU, CHARINDEX('.', a.TAGGRU) + 1) + 1) > 0
              THEN LEFT(a.TAGGRU,
                     CHARINDEX('.', a.TAGGRU,
                       CHARINDEX('.', a.TAGGRU, CHARINDEX('.', a.TAGGRU) + 1) + 1))
            WHEN CHARINDEX('.', a.TAGGRU, CHARINDEX('.', a.TAGGRU) + 1) > 0
              THEN a.TAGGRU   -- nível 2: usa o próprio
            ELSE a.TAGGRU     -- nível 1: usa o próprio
          END AS GRU3_PREFIX

        FROM APLIC a
        WHERE a.ATIVO = 'S'
      )
      SELECT
        p.CODAPL,
        p.TAG,
        p.DESCRICAO,
        p.ATIVO,

        /* Área (nível 2) */
        ISNULL(RTRIM(g2.TAG),        'SEM-AREA')       AS GRU2_TAG,
        ISNULL(RTRIM(g2.DESCRICAO),  'Sem Área')       AS GRU2_NOME,

        /* Sub-sistema (nível 3) */
        ISNULL(RTRIM(g3.TAG),        ISNULL(p.GRU3_PREFIX, 'SEM-SUB')) AS GRU3_TAG,
        ISNULL(RTRIM(g3.DESCRICAO),  ISNULL(p.GRU3_PREFIX, 'Sem Subgrupo')) AS GRU3_NOME

      FROM PREFIXES p
      LEFT JOIN APLIC g2 ON g2.TAGGRU = p.GRU2_PREFIX AND g2.ATIVO = 'S'
      LEFT JOIN APLIC g3 ON g3.TAGGRU = p.GRU3_PREFIX AND g3.ATIVO = 'S'
      ORDER BY GRU2_NOME, GRU3_NOME, p.TAG
    `);

    await pool.close();

    // ── Agrupamento em memória ────────────────────────────────────────────────
    const areaMap = new Map<string, GrupoNode>();

    for (const r of result.recordset) {
      // Garante área
      if (!areaMap.has(r.GRU2_TAG)) {
        areaMap.set(r.GRU2_TAG, {
          gruTag: r.GRU2_TAG,
          descricao: r.GRU2_NOME,
          subgrupos: [],
        });
      }
      const area = areaMap.get(r.GRU2_TAG)!;

      // Garante sub-grupo
      let sub = area.subgrupos.find((s) => s.gruTag === r.GRU3_TAG);
      if (!sub) {
        sub = { gruTag: r.GRU3_TAG, descricao: r.GRU3_NOME, equips: [] };
        area.subgrupos.push(sub);
      }

      sub.equips.push({
        codApl:   r.CODAPL,
        tag:      r.TAG,
        descricao: r.DESCRICAO,
        ativo:    r.ATIVO === "S",
      });
    }

    // "Sem Área" vai por último
    const grupos = Array.from(areaMap.values()).sort((a, b) => {
      if (a.gruTag === "SEM-AREA") return 1;
      if (b.gruTag === "SEM-AREA") return -1;
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
