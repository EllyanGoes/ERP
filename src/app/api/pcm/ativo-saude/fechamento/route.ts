export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import type { Criticidade, FechamentoMtbf } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getAgregadoMensal,
  diasNoMes,
  calcMtbf,
  calcMttr,
  type AgregadoMensalAtivo,
} from "@/lib/pcm-mtbf";

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
  // referência das OS do ERP (origem / detecção de ajuste)
  osFalhas: number;
  osParada: number;
  temEstimativa: boolean; // tem falha sem início/fim de parada na OS (parada = 0h)
}

export interface FechamentoResponse {
  ano: number;
  mes: number;
  dias: number;
  rows: FechamentoRow[];
  source: "db";
}

// ── GET: lista do mês (prefill das OS + regime + salvo) ──────────────────────────
export async function GET(req: NextRequest) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;

  const ano = parseInt(req.nextUrl.searchParams.get("ano") ?? "", 10);
  const mes = parseInt(req.nextUrl.searchParams.get("mes") ?? "", 10);
  if (!Number.isInteger(ano) || ano < 2000 || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "Parâmetros ano/mes inválidos" }, { status: 400 });
  }

  // OS do mês (ManutOrdem) + fechamentos salvos. Regime e criticidade vêm do
  // próprio ManutAtivo (fase 4), ligado ao fechamento pelo ativoId.
  const [agregados, salvos] = await Promise.all([
    getAgregadoMensal(ano, mes),
    prisma.fechamentoMtbf.findMany({ where: { ano, mes } }),
  ]);
  const ativoIds = Array.from(new Set([
    ...agregados.map((a) => a.ativoId),
    ...salvos.map((s) => s.ativoId).filter((id): id is string => !!id),
  ]));
  const ativos = ativoIds.length
    ? await prisma.manutAtivo.findMany({
        where: { id: { in: ativoIds } },
        select: { id: true, codApl: true, criticidade: true, horasPorDia: true },
      })
    : [];

  // A linha segue indexada pelo codApl (chave do fechamento e da tela);
  // codApl é único no ManutAtivo, então é 1:1 com o ativoId.
  const aggMap = new Map<number, AgregadoMensalAtivo>(agregados.map((a) => [a.codApl, a]));
  const savedMap = new Map<number, FechamentoMtbf>(salvos.map((s) => [s.codApl, s]));
  const ativoMap = new Map<number, { criticidade: Criticidade | null; horasPorDia: number | null }>(
    ativos.map((a) => [a.codApl, a]),
  );

  const dias = diasNoMes(ano, mes);

  // União: ativos com atividade no mês ∪ ativos já com fechamento salvo
  const codAplSet = new Set<number>();
  for (const a of agregados) codAplSet.add(a.codApl);
  for (const s of salvos) codAplSet.add(s.codApl);

  const rows: FechamentoRow[] = [];
  for (const codApl of Array.from(codAplSet)) {
    const agg = aggMap.get(codApl);
    const saved = savedMap.get(codApl);
    const regime = ativoMap.get(codApl)?.horasPorDia ?? null;

    const osFalhas = agg?.numeroFalhas ?? 0;
    const osParada = agg?.horasParada ?? 0;
    const temEstimativa = agg ? agg.falhasComCarimbo < agg.numeroFalhas : false;

    // prefill: funcionamento = dias × regime (padrão 24); parada/falhas = OS do mês
    const prefillFunc = dias * (regime ?? 24);
    const horasFuncionamento = saved?.horasFuncionamento ?? prefillFunc;
    const horasParadaNaoPlanejada = saved?.horasParadaNaoPlanejada ?? osParada;
    const numeroFalhas = saved?.numeroFalhas ?? osFalhas;

    rows.push({
      codApl,
      tag: agg?.tag ?? saved?.tag ?? String(codApl),
      descricao: agg?.descricao ?? saved?.descricao ?? "",
      criticidade: ativoMap.get(codApl)?.criticidade ?? null,
      regimeHorasDia: regime,
      horasFuncionamento,
      horasParadaNaoPlanejada,
      numeroFalhas,
      mtbf: calcMtbf(horasFuncionamento, horasParadaNaoPlanejada, numeroFalhas),
      mttr: calcMttr(horasParadaNaoPlanejada, numeroFalhas),
      fechado: saved?.fechado ?? false,
      observacao: saved?.observacao ?? null,
      salvo: !!saved,
      osFalhas,
      osParada,
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
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;

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

  // Liga o fechamento ao ativo (FK). codApl segue como snapshot/chave única;
  // código histórico sem ativo cadastrado grava ativoId nulo.
  const ativo = await prisma.manutAtivo.findUnique({ where: { codApl }, select: { id: true } });
  const ativoId = ativo?.id ?? null;

  const registro = await prisma.fechamentoMtbf.upsert({
    where: { codApl_ano_mes: { codApl, ano, mes } },
    create: { codApl, ano, mes, ativoId, ...dados },
    update: { ...dados, ativoId },
  });

  return NextResponse.json({
    data: {
      ...registro,
      mtbf: calcMtbf(horasFuncionamento, horasParadaNaoPlanejada, dados.numeroFalhas),
      mttr: calcMttr(horasParadaNaoPlanejada, dados.numeroFalhas),
    },
  });
}
