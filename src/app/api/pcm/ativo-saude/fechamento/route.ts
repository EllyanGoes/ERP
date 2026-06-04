export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { Criticidade, FechamentoMtbf } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getAgregadoMensalEngeman,
  diasNoMes,
  calcMtbf,
  calcMttr,
  type AgregadoMensalAtivo,
} from "@/lib/pcm-mtbf";
import { engemanErrorResponse } from "@/lib/engeman";

export interface FechamentoRow {
  codApl: number;
  tag: string;
  descricao: string;
  criticidade: Criticidade | null;
  regimeHorasDia: number | null; // null = padrão 24h
  // valores efetivos (salvos OU prefill)
  horasFuncionamento: number;
  horasParadaNaoPlanejada: number;
  numeroFalhas: number;
  mtbf: number | null;
  mttr: number | null;
  fechado: boolean;
  observacao: string | null;
  salvo: boolean; // já existe registro salvo
  // referência do Engeman (origem / detecção de ajuste)
  engemanFalhas: number;
  engemanParada: number;
  temEstimativa: boolean; // parada usou fallback HOREXEREA em alguma OS
}

export interface FechamentoResponse {
  ano: number;
  mes: number;
  dias: number;
  rows: FechamentoRow[];
  source: "db";
}

// ── GET: lista do mês (prefill Engeman + regime + salvo) ─────────────────────────
export async function GET(req: NextRequest) {
  const ano = parseInt(req.nextUrl.searchParams.get("ano") ?? "", 10);
  const mes = parseInt(req.nextUrl.searchParams.get("mes") ?? "", 10);
  if (!Number.isInteger(ano) || ano < 2000 || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "Parâmetros ano/mes inválidos" }, { status: 400 });
  }

  // 1) Engeman (somente leitura) — indisponível → 503
  let agregados: AgregadoMensalAtivo[];
  try {
    agregados = await getAgregadoMensalEngeman(ano, mes);
  } catch (err) {
    return engemanErrorResponse("PCM /api/pcm/ativo-saude/fechamento", err);
  }

  // 2) Dados locais
  const [salvos, regimes, criticidades] = await Promise.all([
    prisma.fechamentoMtbf.findMany({ where: { ano, mes } }),
    prisma.ativoRegime.findMany({ select: { codApl: true, horasPorDia: true } }),
    prisma.ativoCriticidade.findMany({ select: { codApl: true, criticidade: true } }),
  ]);

  const aggMap = new Map<number, AgregadoMensalAtivo>(agregados.map((a) => [a.codApl, a]));
  const savedMap = new Map<number, FechamentoMtbf>(salvos.map((s) => [s.codApl, s]));
  const regimeMap = new Map<number, number>(regimes.map((r) => [r.codApl, r.horasPorDia]));
  const critMap = new Map<number, Criticidade>(criticidades.map((c) => [c.codApl, c.criticidade]));

  const dias = diasNoMes(ano, mes);

  // União: ativos com atividade no mês ∪ ativos já com fechamento salvo
  const codAplSet = new Set<number>();
  for (const a of agregados) codAplSet.add(a.codApl);
  for (const s of salvos) codAplSet.add(s.codApl);

  const rows: FechamentoRow[] = [];
  for (const codApl of Array.from(codAplSet)) {
    const agg = aggMap.get(codApl);
    const saved = savedMap.get(codApl);
    const regime = regimeMap.get(codApl) ?? null;

    const engemanFalhas = agg?.numeroFalhas ?? 0;
    const engemanParada = agg?.horasParada ?? 0;
    const temEstimativa = agg ? agg.falhasComCarimbo < agg.numeroFalhas : false;

    // prefill: funcionamento = dias × regime (padrão 24); parada/falhas = Engeman
    const prefillFunc = dias * (regime ?? 24);
    const horasFuncionamento = saved?.horasFuncionamento ?? prefillFunc;
    const horasParadaNaoPlanejada = saved?.horasParadaNaoPlanejada ?? engemanParada;
    const numeroFalhas = saved?.numeroFalhas ?? engemanFalhas;

    rows.push({
      codApl,
      tag: agg?.tag ?? saved?.tag ?? String(codApl),
      descricao: agg?.descricao ?? saved?.descricao ?? "",
      criticidade: critMap.get(codApl) ?? null,
      regimeHorasDia: regime,
      horasFuncionamento,
      horasParadaNaoPlanejada,
      numeroFalhas,
      mtbf: calcMtbf(horasFuncionamento, horasParadaNaoPlanejada, numeroFalhas),
      mttr: calcMttr(horasParadaNaoPlanejada, numeroFalhas),
      fechado: saved?.fechado ?? false,
      observacao: saved?.observacao ?? null,
      salvo: !!saved,
      engemanFalhas,
      engemanParada,
      temEstimativa,
    });
  }

  // Ordena por criticidade (A→B→C→sem) e depois por TAG.
  const ordemCrit: Record<string, number> = { A: 0, B: 1, C: 2 };
  rows.sort((a, b) => {
    const ca = a.criticidade ? ordemCrit[a.criticidade] : 3;
    const cb = b.criticidade ? ordemCrit[b.criticidade] : 3;
    if (ca !== cb) return ca - cb;
    return a.tag.localeCompare(b.tag, "pt-BR");
  });

  return NextResponse.json({ ano, mes, dias, rows, source: "db" } satisfies FechamentoResponse);
}

// ── PUT: salvar/fechar um ativo no mês ───────────────────────────────────────────
export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    codApl?: unknown;
    ano?: unknown;
    mes?: unknown;
    horasFuncionamento?: unknown;
    horasParadaNaoPlanejada?: unknown;
    numeroFalhas?: unknown;
    fechado?: unknown;
    observacao?: unknown;
    tag?: unknown;
    descricao?: unknown;
    fechadoPor?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });

  const codApl = Number(body.codApl);
  const ano = Number(body.ano);
  const mes = Number(body.mes);
  if (
    !Number.isInteger(codApl) || codApl <= 0 ||
    !Number.isInteger(ano) || ano < 2000 ||
    !Number.isInteger(mes) || mes < 1 || mes > 12
  ) {
    return NextResponse.json({ error: "codApl/ano/mes inválidos" }, { status: 400 });
  }

  const horasFuncionamento = Number(body.horasFuncionamento);
  const horasParadaNaoPlanejada = Number(body.horasParadaNaoPlanejada);
  const numeroFalhas = Number(body.numeroFalhas);
  if (![horasFuncionamento, horasParadaNaoPlanejada, numeroFalhas].every((n) => Number.isFinite(n) && n >= 0)) {
    return NextResponse.json(
      { error: "horasFuncionamento, horasParadaNaoPlanejada e numeroFalhas devem ser ≥ 0" },
      { status: 400 },
    );
  }

  const fechado = body.fechado === true;
  const observacao =
    typeof body.observacao === "string" && body.observacao.trim() ? body.observacao.trim() : null;
  const tag = typeof body.tag === "string" ? body.tag : null;
  const descricao = typeof body.descricao === "string" ? body.descricao : null;
  const fechadoPor =
    typeof body.fechadoPor === "string" && body.fechadoPor.trim() ? body.fechadoPor.trim() : null;

  const dados = {
    horasFuncionamento,
    horasParadaNaoPlanejada,
    numeroFalhas: Math.round(numeroFalhas),
    fechado,
    observacao,
    tag,
    descricao,
    fechadoPor: fechado ? fechadoPor : null,
    fechadoEm: fechado ? new Date() : null,
  };

  const registro = await prisma.fechamentoMtbf.upsert({
    where: { codApl_ano_mes: { codApl, ano, mes } },
    create: { codApl, ano, mes, ...dados },
    update: dados,
  });

  return NextResponse.json({
    data: {
      ...registro,
      mtbf: calcMtbf(horasFuncionamento, horasParadaNaoPlanejada, dados.numeroFalhas),
      mttr: calcMttr(horasParadaNaoPlanejada, dados.numeroFalhas),
    },
  });
}
