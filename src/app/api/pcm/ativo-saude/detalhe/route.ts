export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import sql from "mssql";
import { getEngemanConfig, getCorretivoCodes, engemanErrorResponse, stripRtf } from "@/lib/engeman";

export interface OsDetalhe {
  codord: number;
  tipo: string; // TIPMANUT.DESCRICAO
  planejada: boolean; // true = tipo NÃO corretivo (não desconta)
  temDefeito: boolean; // REGSERV.CODDEF preenchido
  contabilizada: boolean; // entra na parada não planejada (regra = tipo corretivo)
  comJanela: boolean; // tem carimbo de parada MAQPAR→MAQFUN; senão a parada principal fica 0
  inicio: string | null; // ISO (MAQPAR, fallback DATPRO)
  fim: string | null; // ISO (MAQFUN, fallback DATFEC)
  horas: number; // parada total (principal + adicionais ORDXPAR)
  paradaAdicional: number; // parte vinda das paradas adicionais (ORDXPAR)
  statord: string;
  descricao: string; // Solicitação (ORDSERV.OBS)
  osNumero: string; // nº da O.S. (ORDSERV.TAG) — CODORD é só o "reduzido"
  tipoSigla: string; // sigla do tipo (TIPMANUT.TAG, ex.: CRN)
  ocorrencia: string | null; // DEFEITO (REGSERV.CODDEF → DEFEITO.DESCRICAO)
  causa: string | null; // CAUSA (REGSERV.CODCAU → CAUSA.DESCRICAO)
  servico: string | null; // serviço executado (REGSERV.DESCRICAO)
}

export interface Segmento {
  codord: number;
  tipo: "naoPlanejada" | "planejada";
  inicioPct: number; // 0–100 dentro do mês
  fimPct: number;
  horas: number;
}

export interface DetalheResponse {
  codApl: number;
  ano: number;
  mes: number;
  inicioMes: string;
  fimMes: string;
  os: OsDetalhe[];
  segmentos: Segmento[];
  resumo: {
    paradaNaoPlanejada: number; // soma das contabilizadas (== nº usado no fechamento)
    nFalhas: number; // contagem das contabilizadas
    paradaDemais: number; // soma das NÃO contabilizadas
    nDemais: number;
    semJanela: number; // contabilizadas sem carimbo de parada MAQPAR→MAQFUN (parada principal = 0)
  };
  source: "db";
}


const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
const round2 = (n: number) => parseFloat(n.toFixed(2));

export async function GET(req: NextRequest) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const codApl = Number(sp.get("codApl"));
  const ano = Number(sp.get("ano"));
  const mes = Number(sp.get("mes"));
  if (
    !Number.isInteger(codApl) || codApl <= 0 ||
    !Number.isInteger(ano) || ano < 2000 ||
    !Number.isInteger(mes) || mes < 1 || mes > 12
  ) {
    return NextResponse.json({ error: "Parâmetros codApl/ano/mes inválidos" }, { status: 400 });
  }

  try {
    const pool = await sql.connect(await getEngemanConfig());
    try {
      const corretivos = new Set(await getCorretivoCodes(pool));

      const result = await pool
        .request()
        .input("codApl", sql.Int, codApl)
        .input("ano", sql.Int, ano)
        .input("mes", sql.Int, mes)
        .query<{
          CODORD: number;
          OBS: string | null;
          DATPRO: Date | null;
          DATFEC: Date | null;
          MAQPAR: Date | null;
          MAQFUN: Date | null;
          STATORD: string | null;
          CODTIPMAN: number | null;
          TIPO: string | null;
          OS_NUMERO: string | null;
          TIPO_SIGLA: string | null;
          TEM_DEFEITO: number;
        }>(`
          SELECT
            o.CODORD,
            o.OBS,
            o.DATPRO,
            o.DATFEC,
            o.MAQPAR,
            o.MAQFUN,
            ISNULL(o.STATORD, 'A') AS STATORD,
            o.CODTIPMAN,
            ISNULL(RTRIM(t.DESCRICAO), 'Tipo ' + CAST(ISNULL(o.CODTIPMAN, 0) AS VARCHAR)) AS TIPO,
            RTRIM(ISNULL(o.TAG, CAST(o.CODORD AS VARCHAR(20)))) AS OS_NUMERO,
            RTRIM(t.TAG) AS TIPO_SIGLA,
            CASE WHEN EXISTS (SELECT 1 FROM REGSERV r WHERE r.CODORD = o.CODORD AND r.CODDEF IS NOT NULL)
                 THEN 1 ELSE 0 END AS TEM_DEFEITO
          FROM ORDSERV o
          LEFT JOIN TIPMANUT t ON t.CODTIPMAN = o.CODTIPMAN
          WHERE o.CODAPL = @codApl
            AND o.CODFIL NOT IN (0)
            AND YEAR(o.DATPRO) = @ano
            AND MONTH(o.DATPRO) = @mes
          ORDER BY o.MAQPAR, o.DATPRO
        `);

      // Ocorrência (DEFEITO) e Causa (CAUSA) por OS via REGSERV — uma OS pode ter vários.
      const regservRes = await pool
        .request()
        .input("codApl", sql.Int, codApl)
        .input("ano", sql.Int, ano)
        .input("mes", sql.Int, mes)
        .query<{ CODORD: number; OCORRENCIA: string | null; CAUSA: string | null; SERVICO: string | null }>(`
          SELECT
            r.CODORD,
            RTRIM(ISNULL(d.DESCRICAO, '')) AS OCORRENCIA,
            RTRIM(ISNULL(c.DESCRICAO, '')) AS CAUSA,
            RTRIM(ISNULL(r.DESCRICAO, '')) AS SERVICO
          FROM REGSERV r
          LEFT JOIN DEFEITO d ON d.CODDEF = r.CODDEF
          LEFT JOIN CAUSA   c ON c.CODCAU = r.CODCAU
          WHERE r.CODDEF IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM ORDSERV o
              WHERE o.CODORD = r.CODORD AND o.CODAPL = @codApl
                AND YEAR(o.DATPRO) = @ano AND MONTH(o.DATPRO) = @mes
            )
        `);
      const regMap = new Map<number, { oc: Set<string>; ca: Set<string>; se: Set<string> }>();
      for (const rr of regservRes.recordset) {
        let e = regMap.get(rr.CODORD);
        if (!e) {
          e = { oc: new Set<string>(), ca: new Set<string>(), se: new Set<string>() };
          regMap.set(rr.CODORD, e);
        }
        if (rr.OCORRENCIA) e.oc.add(rr.OCORRENCIA);
        if (rr.CAUSA) e.ca.add(rr.CAUSA);
        if (rr.SERVICO) e.se.add(rr.SERVICO);
      }

      // Paradas adicionais (ORDXPAR) por OS — somam na parada e viram janelas na timeline.
      const parAddRes = await pool
        .request()
        .input("codApl", sql.Int, codApl)
        .input("ano", sql.Int, ano)
        .input("mes", sql.Int, mes)
        .query<{ CODORD: number; MAQPAR: Date | null; MAQFUN: Date | null; HORAS: number }>(`
          SELECT xp.CODORD, xp.MAQPAR, xp.MAQFUN,
            CASE WHEN xp.MAQPAR IS NOT NULL AND xp.MAQFUN IS NOT NULL
              THEN ABS(DATEDIFF(MINUTE, xp.MAQPAR, xp.MAQFUN)) / 60.0
              ELSE ISNULL(xp.HORINTPARAD, 0) END AS HORAS
          FROM ORDXPAR xp
          WHERE EXISTS (
            SELECT 1 FROM ORDSERV o
            WHERE o.CODORD = xp.CODORD AND o.CODAPL = @codApl
              AND YEAR(o.DATPRO) = @ano AND MONTH(o.DATPRO) = @mes
          )
        `);
      const parAddMap = new Map<number, { horas: number; janelas: { maqpar: Date; maqfun: Date; horas: number }[] }>();
      for (const p of parAddRes.recordset) {
        let e = parAddMap.get(p.CODORD);
        if (!e) {
          e = { horas: 0, janelas: [] };
          parAddMap.set(p.CODORD, e);
        }
        e.horas += p.HORAS ?? 0;
        if (p.MAQPAR && p.MAQFUN) e.janelas.push({ maqpar: p.MAQPAR, maqfun: p.MAQFUN, horas: p.HORAS ?? 0 });
      }

      // Janela do mês (para a timeline em %).
      const inicioMes = new Date(Date.UTC(ano, mes - 1, 1));
      const fimMes = new Date(Date.UTC(ano, mes, 1)); // exclusivo
      const spanMs = fimMes.getTime() - inicioMes.getTime();
      const pct = (d: Date) => {
        const c = Math.min(Math.max(d.getTime(), inicioMes.getTime()), fimMes.getTime());
        return ((c - inicioMes.getTime()) / spanMs) * 100;
      };

      const os: OsDetalhe[] = [];
      const segmentos: Segmento[] = [];

      for (const r of result.recordset) {
        const comJanela = !!(r.MAQPAR && r.MAQFUN);
        // Parada principal = só a janela de máquina parada (MAQPAR→MAQFUN). Sem
        // carimbo → 0h. NÃO usa HOREXEREA (homem-hora, pode se sobrepor entre
        // mecânicos e não é tempo de máquina parada). Parada adicional vem do ORDXPAR.
        const mainHoras = comJanela
          ? Math.abs((r.MAQFUN!.getTime() - r.MAQPAR!.getTime()) / 3600000)
          : 0;
        const add = parAddMap.get(r.CODORD);
        const paradaAdicional = add?.horas ?? 0;
        const horas = mainHoras + paradaAdicional;
        const temDefeito = r.TEM_DEFEITO === 1;
        const planejada = r.CODTIPMAN != null ? !corretivos.has(r.CODTIPMAN) : !temDefeito;
        // Desconta = OS de TIPO corretivo (inspeção/preventiva não contam, mesmo com
        // defeito). temDefeito segue exposto só como informação na tabela.
        const contabilizada = !planejada;

        os.push({
          codord: r.CODORD,
          tipo: r.TIPO ?? "—",
          planejada,
          temDefeito,
          contabilizada,
          comJanela,
          inicio: iso(r.MAQPAR ?? r.DATPRO),
          fim: iso(r.MAQFUN ?? r.DATFEC),
          horas: round2(horas),
          paradaAdicional: round2(paradaAdicional),
          statord: r.STATORD ?? "A",
          descricao: stripRtf(r.OBS) || "",
          osNumero: r.OS_NUMERO ?? String(r.CODORD),
          tipoSigla: r.TIPO_SIGLA ?? r.TIPO ?? "—",
          ocorrencia: regMap.get(r.CODORD)?.oc.size ? Array.from(regMap.get(r.CODORD)!.oc).join(" / ") : null,
          causa: regMap.get(r.CODORD)?.ca.size ? Array.from(regMap.get(r.CODORD)!.ca).join(" / ") : null,
          servico: regMap.get(r.CODORD)?.se.size ? Array.from(regMap.get(r.CODORD)!.se).join(" / ") : null,
        });

        if (comJanela) {
          segmentos.push({
            codord: r.CODORD,
            tipo: contabilizada ? "naoPlanejada" : "planejada",
            inicioPct: round2(pct(r.MAQPAR!)),
            fimPct: round2(pct(r.MAQFUN!)),
            horas: round2(mainHoras),
          });
        }
        // Janelas das paradas adicionais (ORDXPAR) também entram na timeline.
        if (add) {
          for (const j of add.janelas) {
            segmentos.push({
              codord: r.CODORD,
              tipo: contabilizada ? "naoPlanejada" : "planejada",
              inicioPct: round2(pct(j.maqpar)),
              fimPct: round2(pct(j.maqfun)),
              horas: round2(j.horas),
            });
          }
        }
      }

      const contab = os.filter((o) => o.contabilizada);
      const demais = os.filter((o) => !o.contabilizada);

      return NextResponse.json({
        codApl,
        ano,
        mes,
        inicioMes: inicioMes.toISOString(),
        fimMes: fimMes.toISOString(),
        os,
        segmentos,
        resumo: {
          paradaNaoPlanejada: round2(contab.reduce((s, o) => s + o.horas, 0)),
          nFalhas: contab.length,
          paradaDemais: round2(demais.reduce((s, o) => s + o.horas, 0)),
          nDemais: demais.length,
          semJanela: contab.filter((o) => !o.comJanela).length,
        },
        source: "db",
      } satisfies DetalheResponse);
    } finally {
      await pool.close();
    }
  } catch (err) {
    return engemanErrorResponse("PCM /api/pcm/ativo-saude/detalhe", err);
  }
}
