export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import sql from "mssql";
import { getEngemanConfig } from "@/lib/engeman";

export interface AplicacaoNode {
  codApl: number;
  tag: string;
  descricao: string;
  ativo: boolean;
}

export interface LocalNode {
  codLocapl: number | null;
  descricao: string;
  equips: AplicacaoNode[];
}

export interface AplicacoesResponse {
  locais: LocalNode[];
  total: number;
  source: "db";
}


export async function GET() {
  try {
    const pool = await sql.connect(await getEngemanConfig());
    const result = await pool.request().query<{
      CODAPL: number; TAG: string; DESCRICAO: string;
      CODLOCAPL: number | null; LOCAL: string; ATIVO: string;
    }>(`
      SELECT
        a.CODAPL,
        CAST(a.CODAPL AS VARCHAR(20)) AS TAG,
        RTRIM(ISNULL(a.DESCRICAO, 'Sem descrição')) AS DESCRICAO,
        a.CODLOCAPL,
        ISNULL(RTRIM(l.DESCRICAO), 'Sem local') AS LOCAL,
        ISNULL(a.ATIVO, 'N') AS ATIVO
      FROM APLIC a
      LEFT JOIN LOCAPLIC l ON l.CODLOCAPL = a.CODLOCAPL
      ORDER BY LOCAL, a.DESCRICAO
    `);
    await pool.close();

    const map = new Map<string, LocalNode>();
    for (const r of result.recordset) {
      if (!map.has(r.LOCAL)) {
        map.set(r.LOCAL, { codLocapl: r.CODLOCAPL, descricao: r.LOCAL, equips: [] });
      }
      map.get(r.LOCAL)!.equips.push({
        codApl: r.CODAPL,
        tag: r.TAG,
        descricao: r.DESCRICAO,
        ativo: r.ATIVO === "S",
      });
    }

    const locais = Array.from(map.values()).sort((a, b) => a.descricao.localeCompare(b.descricao));
    return NextResponse.json({ locais, total: result.recordset.length, source: "db" } satisfies AplicacoesResponse);
  } catch (err) {
    console.error("[PCM /api/pcm/aplicacoes] Engeman inacessível:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Engeman inacessível" }, { status: 503 });
  }
}
