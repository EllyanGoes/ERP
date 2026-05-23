import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function decNum(val: unknown): number {
  if (val == null) return 0;
  return parseFloat(String(val));
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const item = await prisma.item.findUnique({
    where: { id: params.id },
    select: {
      estoqueMinimo:  true,
      estoqueMaximo:  true,
      pontoReposicao: true,
      leadTimeDias:   true,
      unidade:        { select: { sigla: true } },
      unidadeMedida:  true,
      estoqueItems:   { select: { quantidadeAtual: true } },
    },
  });

  if (!item) return new NextResponse(null, { status: 404 });

  const now     = new Date();
  const dayMs   = 24 * 60 * 60 * 1000;
  const since90 = new Date(now.getTime() - 90 * dayMs);

  const movs = await prisma.movimentacaoEstoque.findMany({
    where: { itemId: params.id, createdAt: { gte: since90 } },
    select: { tipo: true, quantidade: true, saldoDepois: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const saldoAtual    = item.estoqueItems.reduce((s, e) => s + decNum(e.quantidadeAtual), 0);
  const leadTime      = item.leadTimeDias ?? 7;
  const totalSaidas   = movs.filter((m) => m.tipo === "SAIDA").reduce((s, m) => s + decNum(m.quantidade), 0);
  const consumoDiario = totalSaidas / 90;

  const pr   = item.pontoReposicao != null ? decNum(item.pontoReposicao) : consumoDiario * leadTime;
  const eds  = item.estoqueMinimo  != null ? decNum(item.estoqueMinimo)  : consumoDiario * 3;
  const emax = item.estoqueMaximo  != null ? decNum(item.estoqueMaximo)  : null;

  // Build saldo series: 90 historical days
  const labels: string[]      = [];
  const saldoSeries: number[] = [];
  let lastKnownSaldo: number | null = null;

  for (let d = 0; d < 90; d++) {
    const dayDate = new Date(since90.getTime() + d * dayMs);
    labels.push(fmtDate(dayDate));
    const dayEnd      = new Date(dayDate.getTime() + dayMs - 1);
    const movsUpToDay = movs.filter((m) => new Date(m.createdAt) <= dayEnd);
    if (movsUpToDay.length > 0) lastKnownSaldo = decNum(movsUpToDay[movsUpToDay.length - 1].saldoDepois);
    saldoSeries.push(lastKnownSaldo ?? 0);
  }

  // 14-day projection
  let projSaldo = saldoAtual;
  for (let d = 1; d <= 14; d++) {
    labels.push(fmtDate(new Date(now.getTime() + d * dayMs)));
    projSaldo = Math.max(0, projSaldo - consumoDiario);
    saldoSeries.push(parseFloat(projSaldo.toFixed(3)));
  }

  const n        = labels.length;
  const maxSaldo = emax ?? Math.max(...saldoSeries, eds * 1.2, 1);

  const chartConfig = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Saldo",
          data: saldoSeries,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37,99,235,0.08)",
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 0,
        },
        {
          label: "Ponto de Reposição (PR)",
          data: Array(n).fill(parseFloat(pr.toFixed(3))),
          borderColor: "#f59e0b",
          borderWidth: 1.5,
          borderDash: [6, 3],
          pointRadius: 0,
          fill: false,
        },
        {
          label: "Estoque Mínimo (EDS)",
          data: Array(n).fill(parseFloat(eds.toFixed(3))),
          borderColor: "#dc2626",
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      plugins: {
        legend: { position: "bottom", labels: { font: { size: 11 } } },
      },
      scales: {
        x: { ticks: { font: { size: 9 }, maxTicksLimit: 15, maxRotation: 0 } },
        y: {
          beginAtZero: true,
          ticks: { font: { size: 10 } },
          suggestedMax: maxSaldo * 1.1,
        },
      },
    },
  };

  try {
    const encoded = encodeURIComponent(JSON.stringify(chartConfig));
    const url     = `https://quickchart.io/chart?w=900&h=380&c=${encoded}`;
    const res     = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return new NextResponse(null, { status: 502 });
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        "Content-Type":  "image/png",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
