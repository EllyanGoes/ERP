import sql from "mssql";
import { prisma } from "@/lib/prisma";

const ENGEMAN_KEYS = ["db_engeman_host", "db_engeman_name", "db_engeman_user", "db_engeman_password"] as const;

/**
 * Returns an mssql config built from the Configuracao table (saved in
 * Configurações → Integrações), falling back to env vars then hardcoded
 * defaults. Always use this instead of inlining credentials in PCM routes.
 */
export async function getEngemanConfig(overrides?: Partial<sql.config>): Promise<sql.config> {
  const records = await prisma.configuracao.findMany({
    where: { chave: { in: [...ENGEMAN_KEYS] } },
  });

  function cfg(key: typeof ENGEMAN_KEYS[number], envKey: string, fallback: string): string {
    return records.find((r) => r.chave === key)?.valor?.trim()
      || process.env[envKey]
      || fallback;
  }

  return {
    server:   cfg("db_engeman_host",     "ENGEMAN_HOST", "cc210d78ed89.sn.mynetname.net"),
    database: cfg("db_engeman_name",     "ENGEMAN_DB",   "ENGEMAN_SLAVE"),
    user:     cfg("db_engeman_user",     "ENGEMAN_USER", "sa"),
    password: cfg("db_engeman_password", "ENGEMAN_PASS", ""),
    port:     Number(process.env.ENGEMAN_PORT ?? 1433),
    options: {
      encrypt: false,
      trustServerCertificate: true,
      connectTimeout: 20000,
      requestTimeout: 30000,
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
    ...overrides,
  };
}

/**
 * Returns the list of CODTIPMAN values that classify as "corretiva"
 * in the connected Engeman database.
 *
 * Priority:
 *   1. Stored config key `pcm_tipos_corretivos` (comma-separated CODTIPMAN)
 *   2. Auto-detect from TIPMANUT: types whose DESCRICAO contains "CORRETIV" (case-insensitive)
 */
export async function getCorretivoCodes(pool: sql.ConnectionPool): Promise<number[]> {
  const config = await prisma.configuracao.findUnique({
    where: { chave: "pcm_tipos_corretivos" },
  });
  if (config?.valor?.trim()) {
    const codes = config.valor
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (codes.length > 0) return codes;
  }
  // Auto-detect from TIPMANUT description
  const result = await pool
    .request()
    .query<{ CODTIPMAN: number }>(
      `SELECT CODTIPMAN FROM TIPMANUT WHERE UPPER(DESCRICAO) LIKE '%CORRETIV%' ORDER BY CODTIPMAN`
    );
  return result.recordset.map((r) => r.CODTIPMAN);
}

/**
 * Builds a safe SQL IN-list string from an array of integers.
 * Values come from our own DB so there is no injection risk.
 * Returns "(0)" (matches nothing) when the array is empty.
 */
export function inList(codes: number[]): string {
  return codes.length > 0 ? `(${codes.join(",")})` : "(0)";
}
