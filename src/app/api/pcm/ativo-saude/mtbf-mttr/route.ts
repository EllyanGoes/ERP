export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import type { Criticidade } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calcMtbf, calcMttr } from "@/lib/pcm-mtbf";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export interface SerieMes {
  competencia: string; // "YYYY-MM"
  label: string; // "Mai/26"
  mtbf: number | null;
  mttr: number | null;
  falhas: number;
  horasParada: number;
  horasFuncionamento: number;
  ativos: number;
}

export interface AtivoResumo {
  codApl: number;
  tag: string;
  descricao: string;
  criticidade: Criticidade | null;
  falhas: number;
  horasParada: number;
  horasFuncionamento: number;
  mtbf: number | null;
  mttr: number | null;
  meses: number;
}

export interface MtbfMttrResponse {
  serie: SerieMes[];
  porAtivo: AtivoResumo[];
  totais: { falhas: number; horasParada: number; horasFuncionamento: number; mtbf: number | null; mttr: number | null };
  source: "db";
}

/** "YYYY-MM" → número de competência (ano*12 + mes-1). */
function parseComp(s: string | null): number | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{1,2})$/.exec(s.trim());
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return ano * 12 + (mes - 1);
}

const round2 = (n: number | null): number | null => (n === null ? null : parseFloat(n.toFixed(2)));

export async function GET(req: NextRequest) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const de = parseComp(sp.get("de"));
  const ate = parseComp(sp.get("ate"));
  const codAplParam = sp.get("codApl");
  const codApl = codAplParam ? Number(codAplParam) : null;
  const criticidadeParam = sp.get("criticidade");
  const criticidade =
    criticidadeParam === "A" || criticidadeParam === "B" || criticidadeParam === "C"
      ? (criticidadeParam as Criticidade)
      : null;

  // Só meses FECHADOS entram no relatório oficial.
  const [fechamentos, criticidades] = await Promise.all([
    prisma.fechamentoMtbf.findMany({
      where: { fechado: true, ...(codApl && codApl > 0 ? { codApl } : {}) },
    }),
    prisma.ativoCriticidade.findMany({ select: { codApl: true, criticidade: true } }),
  ]);
  const critMap = new Map<number, Criticidade>(criticidades.map((c) => [c.codApl, c.criticidade]));

  // Filtra por intervalo de competências e por criticidade (se pedido).
  const linhas = fechamentos.filter((f) => {
    const comp = f.ano * 12 + (f.mes - 1);
    if (de !== null && comp < de) return false;
    if (ate !== null && comp > ate) return false;
    if (criticidade && (critMap.get(f.codApl) ?? null) !== criticidade) return false;
    return true;
  });

  // ── Série por mês (MTBF/MTTR agregados da seleção) ─────────────────────────
  const porMes = new Map<string, { ano: number; mes: number; func: number; parada: number; falhas: number; ativos: number }>();
  for (const f of linhas) {
    const key = `${f.ano}-${String(f.mes).padStart(2, "0")}`;
    let acc = porMes.get(key);
    if (!acc) {
      acc = { ano: f.ano, mes: f.mes, func: 0, parada: 0, falhas: 0, ativos: 0 };
      porMes.set(key, acc);
    }
    acc.func += f.horasFuncionamento;
    acc.parada += f.horasParadaNaoPlanejada;
    acc.falhas += f.numeroFalhas;
    acc.ativos += 1;
  }
  const serie: SerieMes[] = Array.from(porMes.entries())
    .map(([competencia, a]) => ({
      competencia,
      label: `${MESES[a.mes - 1]}/${String(a.ano).slice(2)}`,
      mtbf: round2(calcMtbf(a.func, a.parada, a.falhas)),
      mttr: round2(calcMttr(a.parada, a.falhas)),
      falhas: a.falhas,
      horasParada: round2(a.parada)!,
      horasFuncionamento: round2(a.func)!,
      ativos: a.ativos,
    }))
    .sort((x, y) => x.competencia.localeCompare(y.competencia));

  // ── Por ativo (acumulado no intervalo) ─────────────────────────────────────
  const porAtivoMap = new Map<number, { tag: string; descricao: string; func: number; parada: number; falhas: number; meses: number }>();
  for (const f of linhas) {
    let acc = porAtivoMap.get(f.codApl);
    if (!acc) {
      acc = { tag: f.tag ?? String(f.codApl), descricao: f.descricao ?? "", func: 0, parada: 0, falhas: 0, meses: 0 };
      porAtivoMap.set(f.codApl, acc);
    }
    acc.func += f.horasFuncionamento;
    acc.parada += f.horasParadaNaoPlanejada;
    acc.falhas += f.numeroFalhas;
    acc.meses += 1;
  }
  const ordemCrit: Record<string, number> = { A: 0, B: 1, C: 2 };
  const porAtivo: AtivoResumo[] = Array.from(porAtivoMap.entries())
    .map(([codApl, a]) => ({
      codApl,
      tag: a.tag,
      descricao: a.descricao,
      criticidade: critMap.get(codApl) ?? null,
      falhas: a.falhas,
      horasParada: round2(a.parada)!,
      horasFuncionamento: round2(a.func)!,
      mtbf: round2(calcMtbf(a.func, a.parada, a.falhas)),
      mttr: round2(calcMttr(a.parada, a.falhas)),
      meses: a.meses,
    }))
    .sort((x, y) => {
      const cx = x.criticidade ? ordemCrit[x.criticidade] : 3;
      const cy = y.criticidade ? ordemCrit[y.criticidade] : 3;
      if (cx !== cy) return cx - cy;
      return x.tag.localeCompare(y.tag, "pt-BR");
    });

  // ── Totais ─────────────────────────────────────────────────────────────────
  const tFunc = linhas.reduce((s, f) => s + f.horasFuncionamento, 0);
  const tParada = linhas.reduce((s, f) => s + f.horasParadaNaoPlanejada, 0);
  const tFalhas = linhas.reduce((s, f) => s + f.numeroFalhas, 0);

  return NextResponse.json({
    serie,
    porAtivo,
    totais: {
      falhas: tFalhas,
      horasParada: round2(tParada)!,
      horasFuncionamento: round2(tFunc)!,
      mtbf: round2(calcMtbf(tFunc, tParada, tFalhas)),
      mttr: round2(calcMttr(tParada, tFalhas)),
    },
    source: "db",
  } satisfies MtbfMttrResponse);
}
