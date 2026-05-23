/**
 * Gera o relatório de "Necessidades Pendentes de Cotação" em PDF (jsPDF + autoTable)
 * e o texto de resumo em MarkdownV2 para envio via Telegram.
 *
 * Critério — itens que FALTAM ser cotados:
 *   NecessidadeCompra com status APROVADA sem nenhuma cotação vinculada.
 */

import { prisma } from "@/lib/prisma";
import { escMD } from "@/lib/telegram";

export interface RelatorioNecessidadesResult {
  pdfBuffer: Buffer;
  captionText: string;    // MarkdownV2 para a legenda do documento no Telegram
  totalSCs: number;
  totalItens: number;
}

// ── Query ─────────────────────────────────────────────────────────────────────

export async function buildRelatorioNecessidades(): Promise<RelatorioNecessidadesResult> {
  // SCs aprovadas sem nenhuma cotação ainda
  const scs = await prisma.necessidadeCompra.findMany({
    where: {
      status: "APROVADA",
      cotacoes: { none: {} },
    },
    include: {
      itens: {
        include: {
          item: {
            select: {
              codigo: true,
              descricao: true,
              tipoProduto: { select: { nome: true } },
              unidade: { select: { sigla: true } },
              unidadeMedida: true,
            },
          },
        },
      },
      setor: { select: { nome: true } },
      filial: { select: { razaoSocial: true, nomeFantasia: true } },
    },
    orderBy: [
      { prioridade: "asc" },   // 1 = alta, 3 = normal, 5 = baixa
      { dataNecessidade: "asc" },
      { numero: "asc" },
    ],
  });

  const totalItens = scs.reduce((s, sc) => s + sc.itens.length, 0);
  const dateLabel  = new Date().toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
  });

  // ── PDF ───────────────────────────────────────────────────────────────────
  const pdfBuffer = await generatePDF(scs, dateLabel);

  // ── Caption MarkdownV2 ────────────────────────────────────────────────────
  const captionLines: string[] = [
    `📋 *Necessidades Pendentes de Cotação*`,
    `📅 ${escMD(dateLabel)}`,
    ``,
    `*${scs.length}* solicitaç${scs.length !== 1 ? "ões" : "ão"} aguardando cotação`,
    `*${totalItens}* ite${totalItens !== 1 ? "ns" : "m"} no total`,
  ];

  if (scs.length === 0) {
    captionLines.push(``, `✅ _Nenhuma SC pendente de cotação\\._`);
  }

  return {
    pdfBuffer,
    captionText: captionLines.join("\n"),
    totalSCs: scs.length,
    totalItens,
  };
}

// ── PDF Generator ─────────────────────────────────────────────────────────────

type SCData = Awaited<ReturnType<typeof prisma.necessidadeCompra.findMany<{
  include: {
    itens: { include: { item: { select: { codigo: true; descricao: true; tipoProduto: { select: { nome: true } }; unidade: { select: { sigla: true } }; unidadeMedida: true } } } };
    setor: { select: { nome: true } };
    filial: { select: { razaoSocial: true; nomeFantasia: true } };
  };
}>>>;

const PRIORIDADE_LABEL: Record<number, string> = { 1: "Alta", 2: "Alta", 3: "Normal", 4: "Baixa", 5: "Baixa" };

async function generatePDF(scs: SCData, dateLabel: string): Promise<Buffer> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  // ── Header ─────────────────────────────────────────────────────────────────
  doc.setFillColor(37, 99, 235);       // blue-600
  doc.rect(0, 0, pageW, 22, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("RELATÓRIO — NECESSIDADES PENDENTES DE COTAÇÃO", 14, 10);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Gerado em: ${dateLabel}`, 14, 17);
  doc.text(`Total: ${scs.length} SC(s) · ${scs.reduce((s, sc) => s + sc.itens.length, 0)} iten(s)`, pageW - 14, 17, { align: "right" });

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (scs.length === 0) {
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(12);
    doc.setFont("helvetica", "italic");
    doc.text("Nenhuma Solicitação de Compra aprovada aguarda cotação.", pageW / 2, 60, { align: "center" });
    return Buffer.from(doc.output("arraybuffer"));
  }

  // ── Table ──────────────────────────────────────────────────────────────────
  // Flatten rows: one row per item
  type TableRow = (string | number)[];
  const rows: TableRow[] = [];

  for (const sc of scs) {
    const filial = sc.filial?.nomeFantasia || sc.filial?.razaoSocial || "—";
    const setor  = sc.setor?.nome || "—";
    const prazo  = sc.dataNecessidade
      ? new Date(sc.dataNecessidade).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" })
      : "—";
    const prio   = PRIORIDADE_LABEL[sc.prioridade] ?? "Normal";
    const criado = new Date(sc.createdAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

    if (sc.itens.length === 0) {
      rows.push([sc.numero, filial, setor, "—", "—", "—", "—", prio, prazo, criado]);
      continue;
    }

    sc.itens.forEach((it, idx) => {
      const unidade = it.item.unidade?.sigla || it.item.unidadeMedida || "UN";
      const qty = parseFloat(it.quantidade.toString()).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
      rows.push([
        idx === 0 ? sc.numero : "",            // SC (só primeira linha)
        idx === 0 ? filial    : "",
        idx === 0 ? setor     : "",
        it.item.codigo,
        it.item.descricao,
        it.item.tipoProduto?.nome || "—",
        `${qty} ${unidade}`,
        idx === 0 ? prio      : "",
        idx === 0 ? prazo     : "",
        idx === 0 ? criado    : "",
      ]);
    });
  }

  autoTable(doc, {
    startY: 26,
    head: [[
      "Solicitação", "Filial", "Setor",
      "Código", "Descrição do Produto", "Categoria",
      "Qtd.", "Prioridade", "Prazo Necessidade", "Criado em",
    ]],
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
      0:  { cellWidth: 22, fontStyle: "bold", textColor: [37, 99, 235] },  // SC
      1:  { cellWidth: 28 },   // Filial
      2:  { cellWidth: 24 },   // Setor
      3:  { cellWidth: 22, font: "courier", fontSize: 7, textColor: [60, 60, 60] }, // Código
      4:  { cellWidth: "auto" }, // Descrição
      5:  { cellWidth: 24 },   // Categoria
      6:  { cellWidth: 20, halign: "right" }, // Qtd
      7:  { cellWidth: 20, halign: "center" }, // Prioridade
      8:  { cellWidth: 26, halign: "center" }, // Prazo
      9:  { cellWidth: 22, halign: "center" }, // Criado em
    },
    didParseCell: (data) => {
      // Highlight "Alta" prioridade
      if (data.column.index === 7 && data.cell.raw === "Alta") {
        data.cell.styles.textColor = [185, 28, 28];
        data.cell.styles.fontStyle = "bold";
      }
      // Dim empty SC cells (repeated rows)
      if (data.column.index === 0 && data.cell.raw === "") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data.cell.styles as unknown as Record<string, unknown>).fillColor = [255, 255, 255];
      }
    },
    margin: { left: 10, right: 10 },
  });

  // ── Footer on each page ────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageCount = (doc.internal as any).getNumberOfPages() as number;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.setFont("helvetica", "normal");
    const pageH = doc.internal.pageSize.getHeight();
    doc.text(`Página ${i} / ${pageCount}  ·  Relatório gerado em ${dateLabel}  ·  ERP Sigma`, pageW / 2, pageH - 4, { align: "center" });
  }

  return Buffer.from(doc.output("arraybuffer"));
}
