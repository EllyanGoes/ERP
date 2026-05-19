export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import sql from "mssql";

export interface AplicacaoNode {
  codApl: number;
  tag: string;
  descricao: string;
}

export interface LocalNode {
  codLocapl: number | null;
  descricao: string;
  equips: AplicacaoNode[];
}

export interface AplicacoesResponse {
  locais: LocalNode[];
  total: number;
  source: "db" | "mock";
}

const dbConfig: sql.config = {
  server:   process.env.ENGEMAN_HOST ?? "192.168.0.206",
  database: process.env.ENGEMAN_DB   ?? "ENGEMAN_SLAVE",
  user:     process.env.ENGEMAN_USER ?? "sa",
  password: process.env.ENGEMAN_PASS ?? "Tramontin10@",
  port:     Number(process.env.ENGEMAN_PORT ?? 1433),
  options: { encrypt: false, trustServerCertificate: true, connectTimeout: 8000, requestTimeout: 15000 },
  pool: { max: 3, min: 0, idleTimeoutMillis: 30000 },
};

export async function GET() {
  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request().query<{
      CODAPL: number; TAG: string; DESCRICAO: string;
      CODLOCAPL: number | null; LOCAL: string;
    }>(`
      SELECT
        a.CODAPL,
        ISNULL(a.TAG, '') AS TAG,
        RTRIM(ISNULL(a.DESCRICAO, 'Sem descrição')) AS DESCRICAO,
        a.CODLOCAPL,
        ISNULL(RTRIM(l.DESCRICAO), 'Sem local') AS LOCAL
      FROM APLIC a
      LEFT JOIN LOCAPLIC l ON l.CODLOCAPL = a.CODLOCAPL
      WHERE a.ATIVO = 'S'
      ORDER BY LOCAL, a.DESCRICAO
    `);
    await pool.close();

    const map = new Map<string, LocalNode>();
    for (const r of result.recordset) {
      if (!map.has(r.LOCAL)) {
        map.set(r.LOCAL, { codLocapl: r.CODLOCAPL, descricao: r.LOCAL, equips: [] });
      }
      map.get(r.LOCAL)!.equips.push({ codApl: r.CODAPL, tag: r.TAG, descricao: r.DESCRICAO });
    }

    const locais = Array.from(map.values()).sort((a, b) => a.descricao.localeCompare(b.descricao));
    return NextResponse.json({ locais, total: result.recordset.length, source: "db" } satisfies AplicacoesResponse);
  } catch {
    // Mock fallback - same equipment as indicators mock
    const locais: LocalNode[] = [
      { codLocapl: 1, descricao: "FROTA", equips: [{ codApl: 269, tag: "EPA-0001", descricao: "EMPILHADEIRA BAOLI KBD30" }] },
      { codLocapl: 2, descricao: "LINHA DE PRODUÇÃO 1 (SECADOR ESTUFA)", equips: [
        { codApl: 505, tag: "MAR-0003", descricao: "MAROMBA 01 (BERTAN)" },
        { codApl: 23,  tag: "MES-0003", descricao: "MESA DE CORTE 03" },
        { codApl: 20,  tag: "LAM-0001", descricao: "LAMINADOR 01" },
        { codApl: 55,  tag: "MAR-0001", descricao: "MAROMBA 1" },
      ]},
      { codLocapl: 3, descricao: "CHAMOTE", equips: [{ codApl: 84, tag: "BRT-0001", descricao: "BRITADOR MARTELO" }] },
      { codLocapl: 4, descricao: "QUEIMA", equips: [{ codApl: 129, tag: "FOR-0000", descricao: "ÁREA DO FORNO" }] },
      { codLocapl: 5, descricao: "LD FORNO", equips: [{ codApl: 143, tag: "CRC-0003", descricao: "CARACOL EXTRUSOR 01" }] },
      { codLocapl: 6, descricao: "ESTUFA 1", equips: [{ codApl: 496, tag: "EXT-0001", descricao: "EXTRATOR 01" }] },
      { codLocapl: 7, descricao: "ÁREA DE PRODUÇÃO", equips: [{ codApl: 123, tag: "CPA-0001", descricao: "COMPRESSOR DE AR 1" }] },
    ];
    return NextResponse.json({ locais, total: locais.reduce((s, l) => s + l.equips.length, 0), source: "mock" } satisfies AplicacoesResponse);
  }
}
