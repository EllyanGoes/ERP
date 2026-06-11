export const dynamic = "force-dynamic";
import sql from "mssql";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { getEngemanConfig, stripRtf } from "@/lib/engeman";

// ─────────────────────────────────────────────────────────────────────────────
// Quadro de O.S. por setor executante (Engeman, somente leitura).
//
// Traz as O.S. NÃO finalizadas (em aberto / em espera / em progresso),
// agrupadas por setor executante (SETEXE), com os detalhes que o card mostra:
// número, descrição, ativo, tipo, datas, atraso e responsáveis (mão de obra
// alocada na O.S. via ORDXFUN → FUNC; o Engeman costuma apontar na execução,
// então O.S. recém-abertas podem ainda não ter responsável).
// ─────────────────────────────────────────────────────────────────────────────

export type StatusOS = "A" | "E" | "P";

export interface CardOS {
  codOrd: number;
  numero: string;
  descricao: string;
  ativo: string | null;
  tipo: string | null;
  status: StatusOS;
  dataEntrada: string | null;
  dataProgramada: string | null;
  atrasada: boolean;
  responsaveis: string[];
  setor: string;
  ocorrencias: string[];
  causas: string[];
  servicos: string[];
}

export interface SetorQuadro {
  codSet: number | null;
  setor: string;
  total: number;
  atrasadas: number;
  os: CardOS[];
}

export interface QuadroOsResponse {
  totais: { os: number; emAberto: number; emEspera: number; emProgresso: number; atrasadas: number; setores: number };
  setores: SetorQuadro[];
  source: "db";
  generatedAt: string;
}

export async function GET() {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;

  let pool: sql.ConnectionPool | null = null;
  try {
    pool = await sql.connect(await getEngemanConfig());

    const osResult = await pool.request().query<{
      CODORD: number; NUMERO: string; OBS: string | null; STATORD: string;
      SETOR: string | null; CODSET: number | null;
      ATIVO: string | null; TIPO: string | null;
      DATENT: Date | null; DATPRO: Date | null;
    }>(`
      SELECT
        o.CODORD,
        RTRIM(ISNULL(o.TAG, CAST(o.CODORD AS VARCHAR(20)))) AS NUMERO,
        LEFT(CAST(o.OBS AS VARCHAR(400)), 400)              AS OBS,
        ISNULL(o.STATORD, 'A')                              AS STATORD,
        RTRIM(CAST(s.DESCRICAO AS VARCHAR(80)))             AS SETOR,
        o.CODSET                                            AS CODSET,
        RTRIM(ISNULL(CAST(a.DESCRICAO AS VARCHAR(120)), a.TAG)) AS ATIVO,
        RTRIM(CAST(t.DESCRICAO AS VARCHAR(80)))             AS TIPO,
        o.DATENT, o.DATPRO
      FROM ORDSERV o
      LEFT JOIN SETEXE s   ON s.CODSET = o.CODSET
      LEFT JOIN APLIC a    ON a.CODAPL = o.CODAPL
      LEFT JOIN TIPMANUT t ON t.CODTIPMAN = o.CODTIPMAN
      WHERE ISNULL(o.STATORD, 'A') IN ('A', 'E', 'P')
      ORDER BY o.DATPRO ASC, o.DATENT ASC
    `);

    // responsáveis (mão de obra) das O.S. abertas
    const respResult = await pool.request().query<{ CODORD: number; NOME: string }>(`
      SELECT DISTINCT x.CODORD, RTRIM(CAST(f.NOME AS VARCHAR(80))) AS NOME
      FROM ORDXFUN x
      JOIN FUNC f ON f.CODFUN = x.CODFUN
      WHERE x.CODORD IN (SELECT CODORD FROM ORDSERV WHERE ISNULL(STATORD, 'A') IN ('A', 'E', 'P'))
    `);

    // ocorrência/causa/serviço apontados (REGSERV) — para o popup de detalhe
    const regResult = await pool.request().query<{ CODORD: number; OCORRENCIA: string | null; CAUSA: string | null; SERVICO: string | null }>(`
      SELECT r.CODORD,
        RTRIM(ISNULL(d.DESCRICAO, '')) AS OCORRENCIA,
        RTRIM(ISNULL(c.DESCRICAO, '')) AS CAUSA,
        RTRIM(ISNULL(CAST(r.DESCRICAO AS VARCHAR(400)), '')) AS SERVICO
      FROM REGSERV r
      LEFT JOIN DEFEITO d ON d.CODDEF = r.CODDEF
      LEFT JOIN CAUSA   c ON c.CODCAU = r.CODCAU
      WHERE r.CODORD IN (SELECT CODORD FROM ORDSERV WHERE ISNULL(STATORD, 'A') IN ('A', 'E', 'P'))
    `);
    const regPorOs = new Map<number, { oc: Set<string>; ca: Set<string>; se: Set<string> }>();
    for (const r of regResult.recordset) {
      let e = regPorOs.get(r.CODORD);
      if (!e) { e = { oc: new Set(), ca: new Set(), se: new Set() }; regPorOs.set(r.CODORD, e); }
      if (r.OCORRENCIA) e.oc.add(r.OCORRENCIA);
      if (r.CAUSA) e.ca.add(r.CAUSA);
      if (r.SERVICO) e.se.add(stripRtf(r.SERVICO));
    }

    const respPorOs = new Map<number, string[]>();
    for (const r of respResult.recordset) {
      const lista = respPorOs.get(r.CODORD) ?? [];
      lista.push(r.NOME);
      respPorOs.set(r.CODORD, lista);
    }

    const agora = Date.now();
    const porSetor = new Map<string, SetorQuadro>();
    let emAberto = 0, emEspera = 0, emProgresso = 0, atrasadasTotal = 0;

    for (const r of osResult.recordset) {
      const status = (["A", "E", "P"].includes(r.STATORD) ? r.STATORD : "A") as StatusOS;
      if (status === "A") emAberto++;
      else if (status === "E") emEspera++;
      else emProgresso++;

      const atrasada = !!r.DATPRO && r.DATPRO.getTime() < agora;
      if (atrasada) atrasadasTotal++;

      const reg = regPorOs.get(r.CODORD);
      const card: CardOS = {
        codOrd: r.CODORD,
        numero: r.NUMERO,
        descricao: stripRtf(r.OBS).replace(/\r?\n/g, " ").trim() || "(sem descrição)",
        ativo: r.ATIVO,
        tipo: r.TIPO,
        status,
        dataEntrada: r.DATENT ? r.DATENT.toISOString() : null,
        dataProgramada: r.DATPRO ? r.DATPRO.toISOString() : null,
        atrasada,
        responsaveis: respPorOs.get(r.CODORD) ?? [],
        setor: r.SETOR ?? "(sem setor)",
        ocorrencias: Array.from(reg?.oc ?? []),
        causas: Array.from(reg?.ca ?? []),
        servicos: Array.from(reg?.se ?? []),
      };

      const chave = r.SETOR ?? "(sem setor)";
      const grupo = porSetor.get(chave) ?? { codSet: r.CODSET, setor: chave, total: 0, atrasadas: 0, os: [] };
      grupo.total++;
      if (atrasada) grupo.atrasadas++;
      grupo.os.push(card);
      porSetor.set(chave, grupo);
    }

    const setores = Array.from(porSetor.values()).sort((a, b) => b.total - a.total);

    const resposta: QuadroOsResponse = {
      totais: {
        os: osResult.recordset.length,
        emAberto,
        emEspera,
        emProgresso,
        atrasadas: atrasadasTotal,
        setores: setores.length,
      },
      setores,
      source: "db",
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(resposta);
  } catch (err) {
    console.error("[pcm/quadro-os]", err);
    return NextResponse.json({ error: "Não foi possível consultar o Engeman." }, { status: 502 });
  } finally {
    await pool?.close().catch(() => {});
  }
}
