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
    server:   cfg("db_engeman_host",     "ENGEMAN_HOST", "192.168.0.206"),
    database: cfg("db_engeman_name",     "ENGEMAN_DB",   "ENGEMAN_SLAVE"),
    user:     cfg("db_engeman_user",     "ENGEMAN_USER", "sa"),
    password: cfg("db_engeman_password", "ENGEMAN_PASS", ""),
    port:     Number(process.env.ENGEMAN_PORT ?? 1433),
    options: {
      encrypt: false,
      trustServerCertificate: true,
      connectTimeout: 8000,
      requestTimeout: 20000,
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
    ...overrides,
  };
}
