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

  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth(); // 297
  const pageH = doc.internal.pageSize.getHeight(); // 210

  let isFirstPage = true;

  for (const item of items) {
    if (!isFirstPage) doc.addPage();
    isFirstPage = false;

    const movs       = movsByItem[item.id] ?? [];
    const sigla      = item.unidade?.sigla || item.unidadeMedida;
    const saldoAtual = item.estoqueItems.reduce((s, e) => s + decNum(e.quantidadeAtual), 0);
    const leadTime   = item.leadTimeDias ?? 7;

    // Calculate total saídas in 90 days
    const totalSaidas = movs
      .filter((m) => m.tipo === "SAIDA")
      .reduce((s, m) => s + decNum(m.quantidade), 0);
    const consumoDiario = totalSaidas / 90;

    // Config-based params or derived
    const pr  = item.pontoReposicao != null ? decNum(item.pontoReposicao) : consumoDiario * leadTime;
    const eds = item.estoqueMinimo  != null ? decNum(item.estoqueMinimo)  : consumoDiario * 3;
    const emax = item.estoqueMaximo != null ? decNum(item.estoqueMaximo)  : null;

    // Build daily saldo series (forward fill from saldoDepois)
    const dayMs    = 24 * 60 * 60 * 1000;
    const labels: string[] = [];
    const saldoSeries: number[] = [];

    let lastKnownSaldo: number | null = null;

    for (let d = 0; d < 90; d++) {
      const dayDate = new Date(since90.getTime() + d * dayMs);
      labels.push(fmtDate(dayDate));

      // Find last movement on or before this day
      const dayEnd = new Date(dayDate.getTime() + dayMs - 1);
      const movsUpToDay = movs.filter((m) => new Date(m.createdAt) <= dayEnd);
      if (movsUpToDay.length > 0) {
        lastKnownSaldo = decNum(movsUpToDay[movsUpToDay.length - 1].saldoDepois);
      }
      saldoSeries.push(lastKnownSaldo ?? 0);
    }

    // Add 14-day future projection
    let projSaldo = saldoAtual;
    for (let d = 1; d <= 14; d++) {
      const dayDate = new Date(now.getTime() + d * dayMs);
      labels.push(fmtDate(dayDate));
      projSaldo = Math.max(0, projSaldo - consumoDiario);
      saldoSeries.push(parseFloat(projSaldo.toFixed(3)));
    }

    const n = labels.length; // 104

    // Observed max
    const maxSaldo = emax ?? Math.max(...saldoSeries, eds * 1.2, 1);

    // Build chart config
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
          legend: {
            position: "bottom",
            labels: { font: { size: 10 } },
          },
        },
        scales: {
          x: { ticks: { font: { size: 8 }, maxTicksLimit: 15, maxRotation: 0 } },
          y: { beginAtZero: true, ticks: { font: { size: 9 } }, suggestedMax: maxSaldo * 1.1 },
        },
      },
    };

    // ── Previsão de ruptura ───────────────────────────────────────────────
    let previsaoRupturaText = "—";
    let previsaoColor: [number, number, number] = [75, 85, 99]; // gray-600

    if (consumoDiario > 0) {
      if (saldoAtual <= eds) {
        previsaoRupturaText = "CRÍTICO";
        previsaoColor = [185, 28, 28];
      } else {
        const diasAteRuptura = Math.floor(saldoAtual / consumoDiario);
        const rupturaDate = new Date(now.getTime() + diasAteRuptura * dayMs);
        const rupturaStr  = rupturaDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "America/Sao_Paulo" });
        previsaoRupturaText = `${diasAteRuptura}d (${rupturaStr})`;

        if (diasAteRuptura <= leadTime)     previsaoColor = [185, 28, 28];   // red
        else if (diasAteRuptura <= leadTime * 2) previsaoColor = [180, 83, 9]; // yellow
        else                                previsaoColor = [21, 128, 61];   // green
      }
    }

    // ── PAGE LAYOUT ───────────────────────────────────────────────────────

    // Header (y=0-20)
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageW, 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    const descTrunc = item.descricao.length > 70 ? item.descricao.substring(0, 68) + "…" : item.descricao;
    doc.text(descTrunc, 14, 9);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Código: ${item.codigo}  ·  Análise de Consumo — ${dateLabel}  ·  Últimos 90 dias`, 14, 16);

    // Metric cards (y=23-41) — 6 cards
    const metrics = [
      { label: "Saldo Atual",        value: `${fmt(saldoAtual, 2)} ${sigla}` },
      { label: "Consumo/dia",        value: `${fmt(consumoDiario, 2)} ${sigla}` },
      { label: "Pto. de Reposição",  value: `${fmt(pr, 2)} ${sigla}` },
      { label: "Estoque Mín. (EDS)", value: `${fmt(eds, 2)} ${sigla}` },
      { label: "Estoque Máx.",       value: emax != null ? `${fmt(emax, 2)} ${sigla}` : "Não definido" },
      { label: "Prev. Ruptura",      value: previsaoRupturaText, color: previsaoColor },
    ];

    const cardW   = (pageW - 14 * 2 - 5 * 3) / 6; // 6 cards with 3mm gaps, 14mm margins
    const cardX0  = 14;
    const cardY   = 23;
    const cardH   = 18;

    for (let ci = 0; ci < metrics.length; ci++) {
      const mx = cardX0 + ci * (cardW + 3);
      const m  = metrics[ci];

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(mx, cardY, cardW, cardH, 1.5, 1.5, "FD");

      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139); // gray-500
      doc.text(m.label, mx + 3, cardY + 5.5);

      const color = m.color ?? ([30, 64, 175] as [number, number, number]);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...color);
      doc.text(m.value, mx + 3, cardY + 13);
    }

    // Chart area (y=44-154)
    const chartY  = 44;
    const chartH2 = 110;

    const chartImg = await fetchChartImage(chartConfig);
    if (chartImg) {
      doc.addImage(chartImg, "PNG", 14, chartY, pageW - 28, chartH2);
    } else {
      doc.setFillColor(248, 250, 252);
      doc.rect(14, chartY, pageW - 28, chartH2, "F");
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(150, 150, 150);
      doc.text("Gráfico indisponível (verifique conectividade com QuickChart.io)", pageW / 2, chartY + chartH2 / 2, { align: "center" });
    }

    // Footer (y=206)
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.setFont("helvetica", "normal");
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
