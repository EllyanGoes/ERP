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
    lowercase_keys: false, pageSize: 4096, blobAsText: true,
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
  debitosMes?: number[]; // brutos por mês (p/ corte a partir do cache)
  creditosMes?: number[];
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
    const mensal: number[] = [], debitosMes: number[] = [], creditosMes: number[] = [];
    meses.forEach((m, i) => {
      const d = Number(r[`DEBITO_${m}`] ?? 0), c = Number(r[`CREDITO_${m}`] ?? 0);
      mensal.push(+(d - c).toFixed(2));
      debitosMes.push(+d.toFixed(2)); creditosMes.push(+c.toFixed(2));
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
      mensal, debitosMes, creditosMes,
    });
  }
  return out;
}

// ── Cache no banco do ERP ────────────────────────────────────────────────────
// O Firebird do contador é remoto e lento (um balancete leva vários segundos).
// As telas leem do cache (tabela DexionCache) e só reconsultam quando ele
// passa da validade ou quando o usuário clica em "Atualizar do Dexion".
// Se o Dexion estiver fora do ar e houver cache, devolve o cache (marcado).

export const DEXION_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h

export type ComCache<T> = { dados: T; atualizadoEm: Date; doCache: boolean; erroAtualizacao?: string };

async function lerCache<T>(chave: string): Promise<{ dados: T; atualizadoEm: Date } | null> {
  const c = await prisma.dexionCache.findUnique({ where: { chave } });
  return c ? { dados: c.dados as T, atualizadoEm: c.atualizadoEm } : null;
}

async function gravarCache<T>(chave: string, dados: T): Promise<Date> {
  const agora = new Date();
  await prisma.dexionCache.upsert({
    where: { chave },
    update: { dados: dados as object, atualizadoEm: agora },
    create: { chave, dados: dados as object, atualizadoEm: agora },
  });
  return agora;
}

async function comCache<T>(chave: string, buscar: () => Promise<T>, opts?: { forcar?: boolean; ttlMs?: number }): Promise<ComCache<T>> {
  const ttl = opts?.ttlMs ?? DEXION_CACHE_TTL_MS;
  const cache = await lerCache<T>(chave);
  if (cache && !opts?.forcar && Date.now() - cache.atualizadoEm.getTime() < ttl) {
    return { dados: cache.dados, atualizadoEm: cache.atualizadoEm, doCache: true };
  }
  try {
    const dados = await buscar();
    const atualizadoEm = await gravarCache(chave, dados);
    return { dados, atualizadoEm, doCache: false };
  } catch (e) {
    if (cache) return { dados: cache.dados, atualizadoEm: cache.atualizadoEm, doCache: true, erroAtualizacao: e instanceof Error ? e.message : String(e) };
    throw e;
  }
}

/** Lista de empresas do Dexion, com cache (24h). */
export function dexionEmpresasCache(opts?: { forcar?: boolean }) {
  return comCache<DexionEmpresa[]>("empresas", dexionEmpresas, { ...opts, ttlMs: 24 * 60 * 60 * 1000 });
}

/** Balancete do exercício inteiro (12 meses) com cache; o corte por mês é feito
 *  em memória a partir do `mensal`. Só guarda contas com saldo ou movimento. */
export async function dexionBalanceteCache(codigoEmpresa: number, exercicio: number, opts?: { forcar?: boolean }): Promise<ComCache<DexionContaSaldo[]>> {
  return comCache<DexionContaSaldo[]>(
    `balancete:${codigoEmpresa}:${exercicio}`,
    async () => (await dexionBalancete(codigoEmpresa, exercicio, 12)).filter((c) => c.saldoInicial !== 0 || c.mensal.some((m) => m !== 0)),
    opts,
  );
}

/** Reaplica o corte "até o mês" num balancete vindo do cache (12 meses). */
export function cortarBalancete(contas: DexionContaSaldo[], ateMes: number): DexionContaSaldo[] {
  const ate = Math.min(12, Math.max(1, ateMes));
  return contas.map((c) => {
    // mensal = débito − crédito; recompõe débitos/créditos só dá com os brutos,
    // então guardamos ambos: recalcula a partir dos acumulados por mês.
    const deb = c.debitosMes ? c.debitosMes.slice(0, ate).reduce((a, b) => a + b, 0) : c.debitos;
    const cred = c.creditosMes ? c.creditosMes.slice(0, ate).reduce((a, b) => a + b, 0) : c.creditos;
    return { ...c, debitos: +deb.toFixed(2), creditos: +cred.toFixed(2), saldoFinal: +(c.saldoInicial + deb - cred).toFixed(2) };
  });
}

export type DexionLancamento = {
  lancamento: number;
  partida: number;
  data: string; // ISO (yyyy-mm-dd)
  contaDebito: string | null;
  contaCredito: string | null;
  contaDebitoNome: string | null;
  contaCreditoNome: string | null;
  historico: string;
  valor: number;
  /** Lado em que a conta consultada aparece. */
  lado: "D" | "C";
};

/** Lançamentos do Dexion que tocam a conta (ou prefixo de conta) no mês (1–12;
 *  0 = ano inteiro). Histórico = padrão + complemento. Com cache de 12h. */
export function dexionLancamentos(codigoEmpresa: number, exercicio: number, contaPrefixo: string, mes: number, opts?: { forcar?: boolean }) {
  const prefixo = contaPrefixo.replace(/[^0-9.]/g, "");
  return comCache<DexionLancamento[]>(`lanc:${codigoEmpresa}:${exercicio}:${prefixo}:${mes}`, async () => {
    const filtroMes = mes >= 1 && mes <= 12 ? `AND EXTRACT(MONTH FROM l.DATA) = ${Math.floor(mes)}` : "";
    const rows = await dexionQuery<Row>(
      `SELECT l.LANCAMENTO, l.PARTIDA, l.DATA, l.VALOR, l.CONTA_DEBITO, l.CONTA_CREDITO, l.COMPLEMENTO,
              h.DESCRICAO AS HIST, pd.DESCRICAO AS NOME_D, pc.DESCRICAO AS NOME_C
         FROM C_LANCAMENTOS l
         LEFT JOIN C_HISTORICOS_PADROES h ON h.HISTORICO_PADRAO = l.HISTORICO AND h.TIPO_HISTORICO_PADRAO = l.TIPO_HISTORICO_PADRAO
         LEFT JOIN C_PLANO_CONTAS pd ON pd.TIPO_PLANO_CONTAS = l.TIPO_PLANO_CONTAS AND pd.CONTA = l.CONTA_DEBITO
         LEFT JOIN C_PLANO_CONTAS pc ON pc.TIPO_PLANO_CONTAS = l.TIPO_PLANO_CONTAS AND pc.CONTA = l.CONTA_CREDITO
        WHERE l.EMPRESA = ? AND l.EXERCICIO = ?
          AND (l.CONTA_DEBITO STARTING WITH ? OR l.CONTA_CREDITO STARTING WITH ?) ${filtroMes}
        ORDER BY l.DATA, l.LANCAMENTO, l.PARTIDA`,
      [codigoEmpresa, exercicio, prefixo, prefixo],
      120_000,
    );
    return rows.map((r) => {
      const cd = (r.CONTA_DEBITO as string | null) ?? null, cc = (r.CONTA_CREDITO as string | null) ?? null;
      const hist = [r.HIST, r.COMPLEMENTO].map((x) => (x == null ? "" : String(x).trim())).filter(Boolean).join(" — ");
      const d = r.DATA instanceof Date ? r.DATA : new Date(String(r.DATA));
      return {
        lancamento: Number(r.LANCAMENTO), partida: Number(r.PARTIDA ?? 0),
        data: d.toISOString().slice(0, 10),
        contaDebito: cd, contaCredito: cc,
        contaDebitoNome: (r.NOME_D as string | null) ?? null, contaCreditoNome: (r.NOME_C as string | null) ?? null,
        historico: hist, valor: Number(r.VALOR ?? 0),
        lado: cd && cd.startsWith(prefixo) ? "D" : "C",
      } as DexionLancamento;
    });
  }, opts);
}

/** Só os dígitos do CNPJ/CPF — p/ casar empresa do Dexion com a do ERP. */
export function somenteDigitos(s: string | null | undefined) {
  return (s ?? "").replace(/\D/g, "");
}
