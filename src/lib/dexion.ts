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

type LancBruto = { l: number; p: number; d: string; v: number; cd: string | null; cc: string | null; h: string };

/** Históricos padrão do Dexion (id → descrição), cache 24h. */
async function dexionHistoricos() {
  const c = await comCache<Record<string, string>>("historicos", async () => {
    const rows = await dexionQuery<{ HISTORICO_PADRAO: number; DESCRICAO: string; TIPO_HISTORICO_PADRAO: string }>(
      "SELECT HISTORICO_PADRAO, DESCRICAO, TIPO_HISTORICO_PADRAO FROM C_HISTORICOS_PADROES",
    );
    const m: Record<string, string> = {};
    for (const r of rows) m[`${r.TIPO_HISTORICO_PADRAO}|${r.HISTORICO_PADRAO}`] = r.DESCRICAO ?? "";
    return m;
  }, { ttlMs: 24 * 60 * 60 * 1000 });
  return c.dados;
}

// Lançamentos do ano que tocam um "pedaço" do plano (prefixo de 4 segmentos,
// ex.: 3.1.1.1), em cache. O COMPLEMENTO é blob: buscar linha a linha custa
// uma ida e volta de rede por lançamento (18 s p/ 2 mil linhas); com CAST
// p/ VARCHAR ele vem inline e o ano inteiro do grupo sai em < 1 s. Os nomes
// das contas vêm do balancete em cache, sem join.
async function dexionLancamentosPedaco(codigoEmpresa: number, exercicio: number, pedaco: string, opts?: { forcar?: boolean }) {
  return comCache<LancBruto[]>(`lanc:${codigoEmpresa}:${exercicio}:${pedaco}`, async () => {
    const hist = await dexionHistoricos();
    const rows = await dexionQuery<Row>(
      `SELECT l.LANCAMENTO, l.PARTIDA, l.DATA, l.VALOR, l.CONTA_DEBITO, l.CONTA_CREDITO, l.HISTORICO, l.TIPO_HISTORICO_PADRAO,
              CAST(l.COMPLEMENTO AS VARCHAR(8000)) AS COMPL
         FROM C_LANCAMENTOS l
        WHERE l.EMPRESA = ? AND l.EXERCICIO = ?
          AND (l.CONTA_DEBITO STARTING WITH ? OR l.CONTA_CREDITO STARTING WITH ?)
        ORDER BY l.DATA, l.LANCAMENTO, l.PARTIDA`,
      [codigoEmpresa, exercicio, pedaco, pedaco],
      120_000,
    );
    return rows.map((r) => {
      const d = r.DATA instanceof Date ? r.DATA : new Date(String(r.DATA));
      const padrao = r.HISTORICO == null ? "" : (hist[`${r.TIPO_HISTORICO_PADRAO}|${r.HISTORICO}`] ?? "");
      const compl = r.COMPL == null ? "" : String(r.COMPL).trim();
      return {
        l: Number(r.LANCAMENTO), p: Number(r.PARTIDA ?? 0), d: d.toISOString().slice(0, 10), v: Number(r.VALOR ?? 0),
        cd: (r.CONTA_DEBITO as string | null) ?? null, cc: (r.CONTA_CREDITO as string | null) ?? null,
        h: [padrao, compl].filter(Boolean).join(" — "),
      };
    });
  }, opts);
}

/** Lançamentos do Dexion que tocam a conta (ou prefixo) no mês (1–12; 0 = ano
 *  inteiro). Filtra em memória o pedaço (4 segmentos) em cache. */
export async function dexionLancamentos(codigoEmpresa: number, exercicio: number, contaPrefixo: string, mes: number, opts?: { forcar?: boolean }): Promise<ComCache<DexionLancamento[]>> {
  const prefixo = contaPrefixo.replace(/[^0-9.]/g, "");
  const pedaco = prefixo.split(".").slice(0, 4).join(".");
  const [bruto, balancete] = await Promise.all([
    dexionLancamentosPedaco(codigoEmpresa, exercicio, pedaco, opts),
    dexionBalanceteCache(codigoEmpresa, exercicio),
  ]);
  const nome = new Map(balancete.dados.map((c) => [c.conta, c.descricao]));
  const mm = mes >= 1 && mes <= 12 ? String(Math.floor(mes)).padStart(2, "0") : null;
  const dados: DexionLancamento[] = bruto.dados
    .filter((r) => (r.cd?.startsWith(prefixo) || r.cc?.startsWith(prefixo)) && (!mm || r.d.slice(5, 7) === mm))
    .map((r) => ({
      lancamento: r.l, partida: r.p, data: r.d,
      contaDebito: r.cd, contaCredito: r.cc,
      contaDebitoNome: r.cd ? nome.get(r.cd) ?? null : null, contaCreditoNome: r.cc ? nome.get(r.cc) ?? null : null,
      historico: r.h, valor: r.v,
      lado: r.cd && r.cd.startsWith(prefixo) ? "D" : "C",
    }));
  return { dados, atualizadoEm: bruto.atualizadoEm, doCache: bruto.doCache, erroAtualizacao: bruto.erroAtualizacao };
}

/** Só os dígitos do CNPJ/CPF — p/ casar empresa do Dexion com a do ERP. */
export function somenteDigitos(s: string | null | undefined) {
  return (s ?? "").replace(/\D/g, "");
}
