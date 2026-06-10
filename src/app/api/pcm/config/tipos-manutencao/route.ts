export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import sql from "mssql";
import { prisma } from "@/lib/prisma";
import { getEngemanConfig, getCorretivoCodes, engemanErrorResponse } from "@/lib/engeman";

const CHAVE = "pcm_tipos_corretivos";

export interface TipoManutencao {
  codTipMan: number;
  descricao: string;
  conta: boolean; // conta como falha / parada não planejada
}

export interface TiposResponse {
  tipos: TipoManutencao[];
  fonte: "config" | "auto"; // config explícita salva, ou auto-detecção por "CORRETIV"
  source: "db";
}

// ── GET: lista os tipos do Engeman + marca quais contam hoje ─────────────────────
export async function GET() {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;

  try {
    const pool = await sql.connect(await getEngemanConfig());
    try {
      const [tiposRes, config] = await Promise.all([
        pool.request().query<{ CODTIPMAN: number; DESCRICAO: string }>(`
          SELECT
            CODTIPMAN,
            RTRIM(ISNULL(DESCRICAO, 'Tipo ' + CAST(CODTIPMAN AS VARCHAR))) AS DESCRICAO
          FROM TIPMANUT
          ORDER BY DESCRICAO
        `),
        prisma.configuracao.findUnique({ where: { chave: CHAVE } }),
      ]);

      const corretivos = new Set(await getCorretivoCodes(pool));
      const fonte: "config" | "auto" = config?.valor?.trim() ? "config" : "auto";

      const tipos: TipoManutencao[] = tiposRes.recordset.map((t) => ({
        codTipMan: t.CODTIPMAN,
        descricao: t.DESCRICAO,
        conta: corretivos.has(t.CODTIPMAN),
      }));

      return NextResponse.json({ tipos, fonte, source: "db" } satisfies TiposResponse);
    } finally {
      await pool.close();
    }
  } catch (err) {
    return engemanErrorResponse("PCM /api/pcm/config/tipos-manutencao", err);
  }
}

// ── PUT: salva quais CODTIPMAN contam (em pcm_tipos_corretivos) ──────────────────
export async function PUT(req: NextRequest) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as { codTipMans?: unknown } | null;
  if (!body || !Array.isArray(body.codTipMans)) {
    return NextResponse.json({ error: "Envie codTipMans: number[]" }, { status: 400 });
  }

  const codes = Array.from(
    new Set(body.codTipMans.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)),
  ).sort((a, b) => a - b);

  if (codes.length === 0) {
    return NextResponse.json(
      { error: "Selecione ao menos um tipo que conta como falha" },
      { status: 400 },
    );
  }

  const valor = codes.join(",");
  await prisma.configuracao.upsert({
    where: { chave: CHAVE },
    update: { valor },
    create: { chave: CHAVE, valor },
  });

  return NextResponse.json({ data: { chave: CHAVE, codTipMans: codes } });
}
