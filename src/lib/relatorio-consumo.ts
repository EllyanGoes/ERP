/**
 * Gera o relatório de Análise de Consumo em PDF (jsPDF + addImage)
 * Uma página por produto favoritado.
 * Utiliza QuickChart.io para renderizar o gráfico de evolução de estoque.
 */

import { prisma } from "@/lib/prisma";
import { escMD } from "@/lib/telegram";

export interface RelatorioConsumoResult {
  pdfBuffer: Buffer;
  captionText: string;
  totalProdutos: number;
}

function fmt(n: number, decimals = 1): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: decimals });
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

function decNum(val: unknown): number {
  if (val == null) return 0;
  return parseFloat(String(val));
}

async function fetchChartImage(chartConfig: object): Promise<Buffer | null> {
  try {
    const encoded = encodeURIComponent(JSON.stringify(chartConfig));
    const url = `https://quickchart.io/chart?w=800&h=350&c=${encoded}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function buildRelatorioConsumo(): Promise<RelatorioConsumoResult> {
  // Load all favorited products
  const items = await prisma.item.findMany({
    where: { favorito: true, ativo: true },
    select: {
      id: true,
      codigo: true,
      descricao: true,
      estoqueMinimo: true,
      estoqueMaximo: true,
      pontoReposicao: true,
      leadTimeDias: true,
      unidade: { select: { sigla: true } },
      unidadeMedida: true,
      estoqueItems: { select: { quantidadeAtual: true } },
    },
    orderBy: { descricao: "asc" },
  });

  const dateLabel = new Date().toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
  });

  // Date range: last 90 days
  const now     = new Date();
  const since90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Fetch movements for all favorited products in one query
  const allMovs = await prisma.movimentacaoEstoque.findMany({
    where: {
      itemId: { in: items.map((i) => i.id) },
      createdAt: { gte: since90 },
    },
    select: {
      itemId: true,
      tipo: true,
      quantidade: true,
      saldoDepois: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Group movements by item
  const movsByItem: Record<string, typeof allMovs> = {};
  for (const m of allMovs) {
    if (!movsByItem[m.itemId]) movsByItem[m.itemId] = [];
    movsByItem[m.itemId].push(m);
  }

  const dayMs = 24 * 60 * 60 * 1000;

  // ── Pré-calcular dados de todos os produtos ───────────────────────────────
  type ProductData = {
    item: typeof items[0];
    sigla: string;
    saldoAtual: number;
    consumoDiario: number;
    pr: number;
    eds: number;
    emax: number | null;
    leadTime: number;
    labels: string[];
    saldoSeries: number[];
    previsaoRupturaText: string;
    previsaoColor: [number, number, number];
    chartConfig: object;
  };

  const productDataList: ProductData[] = items.map((item) => {
    const movs       = movsByItem[item.id] ?? [];
    const sigla      = item.unidade?.sigla || item.unidadeMedida;
    const saldoAtual = item.estoqueItems.reduce((s, e) => s + decNum(e.quantidadeAtual), 0);
    const leadTime   = item.leadTimeDias ?? 7;

    const totalSaidas   = movs.filter((m) => m.tipo === "SAIDA").reduce((s, m) => s + decNum(m.quantidade), 0);
    const consumoDiario = totalSaidas / 90;

    const pr   = item.pontoReposicao != null ? decNum(item.pontoReposicao) : consumoDiario * leadTime;
    const eds  = item.estoqueMinimo  != null ? decNum(item.estoqueMinimo)  : consumoDiario * 3;
    const emax = item.estoqueMaximo  != null ? decNum(item.estoqueMaximo)  : null;

    // Build saldo series (90 historical + 14 projected)
    const labels: string[]  = [];
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
          { label: "Saldo", data: saldoSeries, borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,0.08)", fill: true, tension: 0.3, borderWidth: 2, pointRadius: 0 },
          { label: "Ponto de Reposição (PR)", data: Array(n).fill(parseFloat(pr.toFixed(3))), borderColor: "#f59e0b", borderWidth: 1.5, borderDash: [6, 3], pointRadius: 0, fill: false },
          { label: "Estoque Mínimo (EDS)",    data: Array(n).fill(parseFloat(eds.toFixed(3))), borderColor: "#dc2626", borderWidth: 1.5, borderDash: [4, 4], pointRadius: 0, fill: false },
        ],
      },
      options: {
        plugins: { legend: { position: "bottom", labels: { font: { size: 10 } } } },
        scales: {
          x: { ticks: { font: { size: 8 }, maxTicksLimit: 15, maxRotation: 0 } },
          y: { beginAtZero: true, ticks: { font: { size: 9 } }, suggestedMax: maxSaldo * 1.1 },
        },
      },
    };

    let previsaoRupturaText = "—";
    let previsaoColor: [number, number, number] = [75, 85, 99];
    if (consumoDiario > 0) {
      if (saldoAtual <= eds) {
        previsaoRupturaText = "CRÍTICO";
        previsaoColor = [185, 28, 28];
      } else {
        const dias      = Math.floor(saldoAtual / consumoDiario);
        const dtStr     = new Date(now.getTime() + dias * dayMs).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "America/Sao_Paulo" });
        previsaoRupturaText = `${dias}d (${dtStr})`;
        previsaoColor       = dias <= leadTime ? [185, 28, 28] : dias <= leadTime * 2 ? [180, 83, 9] : [21, 128, 61];
      }
    }

    return { item, sigla, saldoAtual, consumoDiario, pr, eds, emax, leadTime, labels, saldoSeries, previsaoRupturaText, previsaoColor, chartConfig };
  });

  // ── Buscar todos os gráficos em paralelo ──────────────────────────────────
  const chartImages = await Promise.all(
    productDataList.map((pd) => fetchChartImage(pd.chartConfig))
  );

  // ── Montar PDF ────────────────────────────────────────────────────────────
  const { default: jsPDF } = await import("jspdf");
  const doc   = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  for (let idx = 0; idx < productDataList.length; idx++) {
    if (idx > 0) doc.addPage();

    const { item, sigla, saldoAtual, consumoDiario, pr, eds, emax, leadTime, previsaoRupturaText, previsaoColor } = productDataList[idx];
    const chartImg = chartImages[idx];

    // Header
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageW, 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13); doc.setFont("helvetica", "bold");
    const descTrunc = item.descricao.length > 70 ? item.descricao.substring(0, 68) + "…" : item.descricao;
    doc.text(descTrunc, 14, 9);
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text(`Código: ${item.codigo}  ·  Análise de Consumo — ${dateLabel}  ·  Últimos 90 dias`, 14, 16);

    // Metric cards
    const metrics = [
      { label: "Saldo Atual",        value: `${fmt(saldoAtual, 2)} ${sigla}` },
      { label: "Consumo/dia",        value: `${fmt(consumoDiario, 2)} ${sigla}` },
      { label: "Pto. de Reposição",  value: `${fmt(pr, 2)} ${sigla}` },
      { label: "Estoque Mín. (EDS)", value: `${fmt(eds, 2)} ${sigla}` },
      { label: "Estoque Máx.",       value: emax != null ? `${fmt(emax, 2)} ${sigla}` : "Não definido" },
      { label: "Prev. Ruptura",      value: previsaoRupturaText, color: previsaoColor },
    ];

    const cardW = (pageW - 14 * 2 - 5 * 3) / 6;
    metrics.forEach((m, ci) => {
      const mx = 14 + ci * (cardW + 3);
      doc.setFillColor(248, 250, 252); doc.setDrawColor(226, 232, 240);
      doc.roundedRect(mx, 23, cardW, 18, 1.5, 1.5, "FD");
      doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139);
      doc.text(m.label, mx + 3, 28.5);
      doc.setFontSize(8.5); doc.setFont("helvetica", "bold");
      doc.setTextColor(...((m.color ?? [30, 64, 175]) as [number, number, number]));
      doc.text(m.value, mx + 3, 36);
    });

    // Chart
    const chartY = 44; const chartH2 = 110;
    if (chartImg) {
      doc.addImage(chartImg, "PNG", 14, chartY, pageW - 28, chartH2);
    } else {
      doc.setFillColor(248, 250, 252); doc.rect(14, chartY, pageW - 28, chartH2, "F");
      doc.setFontSize(9); doc.setFont("helvetica", "italic"); doc.setTextColor(150, 150, 150);
      doc.text("Gráfico indisponível", pageW / 2, chartY + chartH2 / 2, { align: "center" });
    }

    // Footer
    doc.setFontSize(7); doc.setTextColor(150, 150, 150); doc.setFont("helvetica", "normal");
    doc.text(
      `Lead Time: ${leadTime} dias  ·  Consumo médio (90d): ${fmt(consumoDiario, 3)} ${sigla}/dia  ·  ERP Sigma — ${dateLabel}`,
      pageW / 2, pageH - 4, { align: "center" }
    );
  }

  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

  const captionLines = [
    `📊 *Análise de Consumo — ${escMD(dateLabel)}*`,
    ``,
    `*${items.length}* produto${items.length !== 1 ? "s" : ""} favoritado${items.length !== 1 ? "s" : ""} analisado${items.length !== 1 ? "s" : ""}`,
    `_Série histórica: últimos 90 dias \\+ projeção 14 dias_`,
  ];

  if (items.length === 0) {
    captionLines.push(``, `ℹ️ _Nenhum produto favoritado encontrado\\. Acesse a ficha do produto e clique na estrela para favoritar\\._`);
  }

  return {
    pdfBuffer,
    captionText: captionLines.join("\n"),
    totalProdutos: items.length,
  };
}
