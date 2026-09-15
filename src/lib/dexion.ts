// Integração com o Dexion — banco Firebird 2.5 do escritório contábil (cópia
// somente leitura). Mesmo padrão do Engeman: credenciais na tabela
// Configuracao (chaves dexion_*), com fallback em variáveis de ambiente.
// Cada consulta abre e fecha a conexão (attach/detach) — o driver é JS puro
// (node-firebird), sem cliente nativo.
import * as Firebird from "node-firebird";
import { prisma } from "@/lib/prisma";

export const DEXION_KEYS = ["dexion_host", "dexion_port", "dexion_database", "dexion_user", "dexion_password"] as const;
export type DexionKey = typeof DEXION_KEYS[number];

export type DexionConfig = { host: string; port: number; database: string; user: string; password: string };

export async function getDexionConfig(): Promise<DexionConfig> {
  const records = await prisma.configuracao.findMany({ where: { chave: { in: [...DEXION_KEYS] } } });
  const cfg = (key: DexionKey, env: string, fallback = "") =>
    records.find((r) => r.chave === key)?.valor?.trim() || process.env[env] || fallback;
  return {
    host: cfg("dexion_host", "DEXION_HOST"),
    port: Number(cfg("dexion_port", "DEXION_PORT", "3050")) || 3050,
    database: cfg("dexion_database", "DEXION_DATABASE"),
    user: cfg("dexion_user", "DEXION_USER", "sysdba"),
    password: cfg("dexion_password", "DEXION_PASSWORD"),
  };
}

export function dexionConfigurado(c: DexionConfig) {
  return !!(c.host && c.database && c.user && c.password);
}

type Row = Record<string, unknown>;

/** Executa um SELECT no Dexion e devolve as linhas com strings decodificadas (latin1). */
export async function dexionQuery<T extends Row = Row>(sql: string, params: unknown[] = [], timeoutMs = 60_000): Promise<T[]> {
  const c = await getDexionConfig();
  if (!dexionConfigurado(c)) throw new Error("Integração Dexion não configurada (host, caminho do banco, usuário e senha).");
  const opts: Firebird.Options = {
    host: c.host, port: c.port, database: c.database, user: c.user, password: c.password,
    lowercase_keys: false, pageSize: 4096,
  };
  return new Promise<T[]>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Tempo esgotado consultando o Dexion.")), timeoutMs);
    Firebird.attach(opts, (err, db) => {
      if (err) { clearTimeout(timer); return reject(new Error(`Falha ao conectar no Dexion: ${err.message}`)); }
      db.query(sql, params, (e, rows) => {
        clearTimeout(timer);
        db.detach();
        if (e) return reject(new Error(`Erro na consulta ao Dexion: ${e.message}`));
        const lista = (rows ?? []) as Row[];
        for (const r of lista) {
          for (const k of Object.keys(r)) {
            const v = r[k];
            if (Buffer.isBuffer(v)) r[k] = v.toString("latin1");
            else if (typeof v === "string") r[k] = v.trim();
          }
        }
        resolve(lista as T[]);
      });
    });
  });
}

// ── Consultas do processo ─────────────────────────────────────────────────────

export async function dexionStatus() {
  const [v] = await dexionQuery<{ V: string }>("SELECT rdb$get_context('SYSTEM','ENGINE_VERSION') AS V FROM rdb$database");
  const [t] = await dexionQuery<{ N: number }>("SELECT COUNT(*) AS N FROM rdb$relations WHERE rdb$system_flag = 0 AND rdb$view_blr IS NULL");
  return { engine: v?.V ?? "?", tabelas: Number(t?.N ?? 0) };
}

export type DexionEmpresa = { codigo: number; nome: string; fantasia: string | null; cnpj: string | null; exercicio: number | null };

/** Empresas do Dexion — lá cada exercício é uma "empresa" (código próprio). */
export async function dexionEmpresas(): Promise<DexionEmpresa[]> {
  const rows = await dexionQuery<{ EMPRESA: number; NOME: string; NOME_FANTASIA: string | null; CPF_CNPJ: string | null; EXERCICIO: number | null }>(
    "SELECT EMPRESA, NOME, NOME_FANTASIA, CPF_CNPJ, EXERCICIO FROM EMPRESAS ORDER BY EMPRESA",
  );
  return rows.map((r) => ({ codigo: Number(r.EMPRESA), nome: r.NOME ?? "", fantasia: r.NOME_FANTASIA ?? null, cnpj: r.CPF_CNPJ ?? null, exercicio: r.EXERCICIO == null ? null : Number(r.EXERCICIO) }));
}

export type DexionContaSaldo = {
  conta: string;
  descricao: string;
  nivel: number;
  sintetica: boolean;
  natureza: string | null;
  saldoInicial: number;
  debitos: number;
  creditos: number;
  /** Devedor positivo, credor negativo. */
  saldoFinal: number;
  mensal: number[]; // débito − crédito de cada mês (12 posições)
};

/** Balancete do Dexion p/ (código da empresa, exercício) até o mês informado (1–12). */
export async function dexionBalancete(codigoEmpresa: number, exercicio: number, ateMes = 12): Promise<DexionContaSaldo[]> {
  const meses = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  const cols = meses.flatMap((m) => [`s.DEBITO_${m}`, `s.CREDITO_${m}`]).join(", ");
  const rows = await dexionQuery<Row>(
    `SELECT s.CONTA, p.DESCRICAO, p.TIPO, p.NATUREZA, s.SALDO_INICIAL, ${cols}
       FROM C_PLANO_CONTAS_SALDOS s
       JOIN C_PLANO_CONTAS p ON p.TIPO_PLANO_CONTAS = s.TIPO_PLANO_CONTAS AND p.CONTA = s.CONTA
      WHERE s.EMPRESA = ? AND s.EXERCICIO = ?
      ORDER BY s.CONTA`,
    [codigoEmpresa, exercicio],
    120_000,
  );
  const ate = Math.min(12, Math.max(1, ateMes));
  const out: DexionContaSaldo[] = [];
  for (const r of rows) {
    const conta = String(r.CONTA ?? "");
    if (!conta || r.DESCRICAO == null) continue; // contas sem cadastro no plano
    let deb = 0, cred = 0;
    const mensal: number[] = [];
    meses.forEach((m, i) => {
      const d = Number(r[`DEBITO_${m}`] ?? 0), c = Number(r[`CREDITO_${m}`] ?? 0);
      mensal.push(+(d - c).toFixed(2));
      if (i < ate) { deb += d; cred += c; }
    });
    const si = Number(r.SALDO_INICIAL ?? 0);
    out.push({
      conta,
      descricao: String(r.DESCRICAO ?? ""),
      nivel: conta.split(".").length,
      sintetica: String(r.TIPO ?? "") === "0",
      natureza: (r.NATUREZA as string | null) ?? null,
      saldoInicial: +si.toFixed(2),
      debitos: +deb.toFixed(2),
      creditos: +cred.toFixed(2),
      saldoFinal: +(si + deb - cred).toFixed(2),
      mensal,
    });
  }
  return out;
}

/** Só os dígitos do CNPJ/CPF — p/ casar empresa do Dexion com a do ERP. */
export function somenteDigitos(s: string | null | undefined) {
  return (s ?? "").replace(/\D/g, "");
}
