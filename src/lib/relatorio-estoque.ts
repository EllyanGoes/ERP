/**
 * Gera o relatório diário de movimentações de estoque em PDF (jsPDF + autoTable)
 * e o texto de resumo em MarkdownV2 para a legenda do documento no Telegram.
 */

import { prisma } from "@/lib/prisma";
import { escMD } from "@/lib/telegram";

export interface RelatorioResult {
  pdfBuffer: Buffer;
  captionText: string;
  totalMovimentacoes: number;
  isEmpty: boolean;
}

// ── Query ─────────────────────────────────────────────────────────────────────

export async function buildRelatorioEstoque(date: Date): Promise<RelatorioResult> {
  // Converter para início/fim do dia no fuso BRT (UTC-3)
  // BRT = UTC - 3h → para encontrar a meia-noite BRT:
  //   1) subtrair 3h do timestamp UTC para "colocar no relógio BRT"
  //   2) truncar para o início do dia
  //   3) somar 3h de volta para converter para UTC
  const BRT_OFFSET_MS = 3 * 60 * 60 * 1000; // 10_800_000 ms
  const brtMs      = date.getTime() - BRT_OFFSET_MS;
  const brtDayStart = Math.floor(brtMs / 86_400_000) * 86_400_000;
  const startOfDay  = new Date(brtDayStart + BRT_OFFSET_MS); // UTC 03:00 do dia BRT
  const endOfDay    = new Date(brtDayStart + BRT_OFFSET_MS + 86_400_000 - 1);

  const movs = await prisma.movimentacaoEstoque.findMany({
    where: { createdAt: { gte: startOfDay, lte: endOfDay } },
    include: {
      item:         { select: { codigo: true, descricao: true, unidadeMedida: true, unidade: { select: { sigla: true } } } },
      localEstoque: { select: { nome: true } },
      clienteDono:  { select: { razaoSocial: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const dateLabel = startOfDay.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
  });

  // Contadores por tipo
  const contadores: Record<string, number> = { ENTRADA: 0, SAIDA: 0, AJUSTE: 0, TRANSFERENCIA: 0 };
  for (const m of movs) contadores[m.tipo] = (contadores[m.tipo] ?? 0) + 1;

  const pdfBuffer = await generatePDF(movs, dateLabel);

  // ── Caption MarkdownV2 ─────────────────────────────────────────────────────
  const captionLines: string[] = [
    `📦 *Relatório de Estoque — ${escMD(dateLabel)}*`,
    ``,
    `*${movs.length}* movimentação${movs.length !== 1 ? "ões" : ""} no total`,
  ];

  const partes: string[] = [];
  if (contadores.ENTRADA)      partes.push(`✅ ${contadores.ENTRADA} entrada${contadores.ENTRADA !== 1 ? "s" : ""}`);
  if (contadores.SAIDA)        partes.push(`📤 ${contadores.SAIDA} saída${contadores.SAIDA !== 1 ? "s" : ""}`);
  if (contadores.AJUSTE)       partes.push(`🔧 ${contadores.AJUSTE} ajuste${contadores.AJUSTE !== 1 ? "s" : ""}`);
  if (contadores.TRANSFERENCIA) partes.push(`🔄 ${contadores.TRANSFERENCIA} transferência${contadores.TRANSFERENCIA !== 1 ? "s" : ""}`);

  if (partes.length > 0) captionLines.push(partes.map(escMD).join(" · "));
  if (movs.length === 0) captionLines.push(``, `_Nenhuma movimentação registrada neste dia\\._`);

  return {
    pdfBuffer,
    captionText: captionLines.join("\n"),
    totalMovimentacoes: movs.length,
    isEmpty: movs.length === 0,
  };
}

// ── PDF Generator ─────────────────────────────────────────────────────────────

type MovData = Awaited<ReturnType<typeof prisma.movimentacaoEstoque.findMany<{
  include: {
    item:         { select: { codigo: true; descricao: true; unidadeMedida: true; unidade: { select: { sigla: true } } } };
    localEstoque: { select: { nome: true } };
    clienteDono:  { select: { razaoSocial: true } };
  };
}>>>;

const TIPO_META: Record<string, { label: string; color: [number, number, number] }> = {
  ENTRADA:       { label: "Entrada",       color: [22, 163, 74]   },  // green-600
  SAIDA:         { label: "Saída",         color: [220, 38, 38]   },  // red-600
  AJUSTE:        { label: "Ajuste",        color: [234, 179, 8]   },  // yellow-500
  TRANSFERENCIA: { label: "Transferência", color: [37, 99, 235]   },  // blue-600
};

async function generatePDF(movs: MovData, dateLabel: string): Promise<Buffer> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc  = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageW, 22, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("RELATÓRIO DE MOVIMENTAÇÕES DE ESTOQUE", 14, 10);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Data: ${dateLabel}`, 14, 17);
  doc.text(`Total: ${movs.length} movimentação${movs.length !== 1 ? "ões" : ""}`, pageW - 14, 17, { align: "right" });

  // ── Summary chips ───────────────────────────────────────────────────────────
  const contadores: Record<string, number> = { ENTRADA: 0, SAIDA: 0, AJUSTE: 0, TRANSFERENCIA: 0 };
  for (const m of movs) contadores[m.tipo] = (contadores[m.tipo] ?? 0) + 1;

  let chipX = 14;
  const chipY = 27;
  for (const tipo of ["ENTRADA", "SAIDA", "AJUSTE", "TRANSFERENCIA"]) {
    const cnt = contadores[tipo];
    if (!cnt) continue;
    const meta  = TIPO_META[tipo];
    const label = `${meta.label}: ${cnt}`;
    const w     = doc.getTextWidth(label) + 8;
    doc.setFillColor(...meta.color);
    doc.roundedRect(chipX, chipY - 4.5, w, 7, 1.5, 1.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text(label, chipX + 4, chipY);
    chipX += w + 4;
  }

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (movs.length === 0) {
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(12);
    doc.setFont("helvetica", "italic");
    doc.text("Nenhuma movimentação registrada neste dia.", pageW / 2, 60, { align: "center" });
    return Buffer.from(doc.output("arraybuffer"));
  }

  // ── Table ────────────────────────────────────────────────────────────────────
  const rows = movs.map((m) => {
    const unidade = m.item.unidade?.sigla ?? m.item.unidadeMedida ?? "UN";
    const qty     = parseFloat(m.quantidade.toString()).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
    const hora    = new Date(m.createdAt).toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit", minute: "2-digit",
    });
    const meta = TIPO_META[m.tipo] ?? { label: m.tipo, color: [100, 100, 100] as [number, number, number] };
    return [
      hora,
      meta.label,
      m.item.codigo,
      m.item.descricao,
      m.clienteDono ? `${m.localEstoque?.nome ?? "—"} (Terceiro: ${m.clienteDono.razaoSocial})` : m.localEstoque?.nome ?? "—",
      `${qty} ${unidade}`,
      m.documento ?? "—",
    ];
  });

  autoTable(doc, {
    startY: 37,
    head: [["Horário", "Tipo", "Código", "Descrição", "Local", "Quantidade", "Documento"]],
    body: rows,
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { cellWidth: 16, halign: "center" },                                              // Horário
      1: { cellWidth: 26, halign: "center", fontStyle: "bold" },                           // Tipo
      2: { cellWidth: 24, font: "courier", fontSize: 7, textColor: [60, 60, 60] },         // Código
      3: { cellWidth: "auto" },                                                             // Descrição
      4: { cellWidth: 36 },                                                                 // Local
      5: { cellWidth: 26, halign: "right" },                                               // Quantidade
      6: { cellWidth: 28, halign: "center", fontSize: 7, textColor: [100, 100, 100] },     // Documento
    },
    didParseCell: (data) => {
      if (data.column.index === 1 && data.section === "body") {
        const tipo = movs[data.row.index]?.tipo;
        const meta = TIPO_META[tipo ?? ""];
        if (meta) data.cell.styles.textColor = meta.color;
      }
    },
    margin: { left: 10, right: 10 },
  });

  // ── Footer em cada página ────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageCount = (doc.internal as any).getNumberOfPages() as number;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.setFont("helvetica", "normal");
    const pageH = doc.internal.pageSize.getHeight();
    doc.text(
      `Página ${i} / ${pageCount}  ·  Relatório gerado em ${dateLabel}  ·  ERP Sigma`,
      pageW / 2, pageH - 4, { align: "center" }
    );
  }

  return Buffer.from(doc.output("arraybuffer"));
}

// ── Date parser ───────────────────────────────────────────────────────────────

/**
 * Tenta parsear uma data a partir de strings como "22/05/2026", "hoje", "ontem".
 * Retorna `null` se não conseguir parsear.
 */
export function parseRelatorioDate(arg: string): Date | null {
  const norm = arg.trim().toLowerCase();
  if (!norm || norm === "hoje") return new Date();
  if (norm === "ontem") {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  }
  // DD/MM/YYYY ou DD-MM-YYYY
  const m = norm.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const year  = m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
    const month = parseInt(m[2]) - 1;
    const day   = parseInt(m[1]);
    const d = new Date(year, month, day, 12, 0, 0);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}
