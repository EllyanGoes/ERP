export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dataReferenciaOS, wherePeriodoOS } from "@/lib/manutencao/consultas";

// ── Types ──────────────────────────────────────────────────────────────────────
export interface MtbfMensal {
  mes: string;      // "YYYY-MM"
  label: string;    // "Jan/25"
  falhas: number;
  mtbf: number | null; // horas — null quando só há 1 OS no mês (DATEDIFF = 0)
}

export interface MtbfAplicacaoResponse {
  codApl: number;
  tag: string;
  descricao: string;
  // ── MTBF acumulado (fórmula exata do usuário) ──────────────────────────────
  // ROUND((DATEDIFF(MI, DATAMENOR, DATAMAIOR) / 60.0), 2) / QTDEOS
  mtbfAtual: number | null;   // horas — null = sem dados suficientes
  totalFalhas: number;
  dataInicio: string | null;  // ISO — primeira OS do período filtrado
  dataFim: string | null;     // ISO — última OS do período filtrado
  periodoFiltro: { de: string | null; ate: string | null };
  // ── Tendência mensal ───────────────────────────────────────────────────────
  tendencia: MtbfMensal[];
  source: "db";
  generatedAt: string;
}

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// ── Query principal ────────────────────────────────────────────────────────────
// Falha aqui = OS (não cancelada) com ao menos um serviço com sintoma — mesma
// regra do relatório antigo (REGSERV.CODDEF preenchido), sem olhar o tipo.
// Data = data de referência da OS (programadaPara, senão createdAt).

/** Diferença em minutos como o DATEDIFF(MI) do SQL Server (conta viradas de minuto). */
function diffMinutos(a: Date, b: Date): number {
  return Math.floor(b.getTime() / 60_000) - Math.floor(a.getTime() / 60_000);
}

/** MTBF da fórmula do usuário: ROUND(DATEDIFF(MI, menor, maior) / 60.0, 2) / QTDEOS (só com > 1 OS). */
function mtbfFormula(datas: Date[]): number | null {
  if (datas.length <= 1) return null;
  let menor = datas[0];
  let maior = datas[0];
  for (const d of datas) {
    if (d < menor) menor = d;
    if (d > maior) maior = d;
  }
  const horas = Math.round((diffMinutos(menor, maior) / 60) * 100) / 100;
  return parseFloat((horas / datas.length).toFixed(2));
}

async function queryMtbf(
  codApl:     number,
  dataInicio: Date | null,
  dataFim:    Date | null,
): Promise<{
  atual: { mtbf: number | null; totalFalhas: number; dataInicio: Date | null; dataFim: Date | null };
  tendencia: MtbfMensal[];
  aplicacao: { codApl: number; tag: string; descricao: string };
}> {
  // ── 1. Dados do ativo ────────────────────────────────────────────────────
  const ativo = await prisma.manutAtivo.findFirst({
    where: { codApl },
    select: { codApl: true, tag: true, nome: true },
  });

  const baseFalha: Prisma.ManutOrdemWhereInput = {
    ativo: { codApl },
    status: { not: "CANCELADA" },
    servicos: { some: { sintomaId: { not: null } } },
  };
  const buscar = async (inicio: Date | null, fim: Date | null) =>
    (
      await prisma.manutOrdem.findMany({
        where: { AND: [baseFalha, wherePeriodoOS(inicio, fim)] },
        select: { programadaPara: true, createdAt: true },
      })
    ).map(dataReferenciaOS);

  // ── 2. MTBF acumulado — fórmula exata do usuário ──────────────────────────
  const datas = await buscar(dataInicio, dataFim);
  let menor: Date | null = null;
  let maior: Date | null = null;
  for (const d of datas) {
    if (!menor || d < menor) menor = d;
    if (!maior || d > maior) maior = d;
  }

  // ── 3. Tendência mensal — agrupada por mês dentro do período ──────────────
  // Sem filtro de período, usa 6 meses por padrão para a tendência.
  let datasTrend = datas;
  if (!dataInicio && !dataFim) {
    const seisMeses = new Date();
    seisMeses.setMonth(seisMeses.getMonth() - 6);
    datasTrend = await buscar(seisMeses, null);
  }
  const porMes = new Map<string, { ano: number; mes: number; datas: Date[] }>();
  for (const d of datasTrend) {
    const ano = d.getUTCFullYear();
    const mes = d.getUTCMonth() + 1;
    const key = `${ano}-${String(mes).padStart(2, "0")}`;
    let acc = porMes.get(key);
    if (!acc) {
      acc = { ano, mes, datas: [] };
      porMes.set(key, acc);
    }
    acc.datas.push(d);
  }
  const tendencia: MtbfMensal[] = Array.from(porMes.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, a]) => ({
      mes:    key,
      label:  `${MESES[a.mes - 1]}/${String(a.ano).slice(2)}`,
      falhas: a.datas.length,
      mtbf:   mtbfFormula(a.datas),
    }));

  return {
    atual: {
      mtbf:        mtbfFormula(datas),
      totalFalhas: datas.length,
      dataInicio:  menor,
      dataFim:     maior,
    },
    tendencia,
    aplicacao: ativo
      ? { codApl: ativo.codApl, tag: ativo.tag || String(ativo.codApl), descricao: ativo.nome || "Sem descrição" }
      : { codApl, tag: String(codApl), descricao: "Aplicação não encontrada" },
  };
}

// ── Handler ────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;

  const { searchParams } = req.nextUrl;
  const codAplParam      = searchParams.get("codApl");
  const dataInicioParam  = searchParams.get("dataInicio"); // "YYYY-MM-DD"
  const dataFimParam     = searchParams.get("dataFim");    // "YYYY-MM-DD"

  if (!codAplParam) {
    return NextResponse.json({ error: "Parâmetro codApl obrigatório" }, { status: 400 });
  }
  const codApl = parseInt(codAplParam, 10);
  if (isNaN(codApl) || codApl <= 0) {
    return NextResponse.json({ error: "codApl inválido" }, { status: 400 });
  }

  // Parse dates — null = sem filtro. Em UTC: as datas das OS (inclusive o
  // histórico do Engeman) são comparadas pelo dia gravado.
  function parseDate(s: string | null): Date | null {
    if (!s) return null;
    const d = new Date(s + "T00:00:00Z");
    return isNaN(d.getTime()) ? null : d;
  }
  // dataFim goes to end of day
  function parseDateFim(s: string | null): Date | null {
    if (!s) return null;
    const d = new Date(s + "T23:59:59.999Z");
    return isNaN(d.getTime()) ? null : d;
  }

  const dataInicio = parseDate(dataInicioParam);
  const dataFim    = parseDateFim(dataFimParam);

  const { atual, tendencia, aplicacao } = await queryMtbf(codApl, dataInicio, dataFim);

  const response: MtbfAplicacaoResponse = {
    codApl:       aplicacao.codApl,
    tag:          aplicacao.tag,
    descricao:    aplicacao.descricao,
    mtbfAtual:    atual.mtbf,
    totalFalhas:  atual.totalFalhas,
    dataInicio:   atual.dataInicio?.toISOString() ?? null,
    dataFim:      atual.dataFim?.toISOString()    ?? null,
    periodoFiltro: { de: dataInicioParam ?? null, ate: dataFimParam ?? null },
    tendencia,
    source:       "db",
    generatedAt:  new Date().toISOString(),
  };

  return NextResponse.json(response);
}
