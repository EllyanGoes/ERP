import { prisma } from "@/lib/prisma";
import { escMD } from "@/lib/telegram";

export interface RelatorioEstoqueMinimoResult {
  pdfBuffer: Buffer;
  captionText: string;
  totalItens: number;
  isEmpty: boolean;
}

// ── Query ─────────────────────────────────────────────────────────────────────

export async function buildRelatorioEstoqueMinimo(): Promise<RelatorioEstoqueMinimoResult> {
  const candidatos = await prisma.estoqueItem.findMany({
    where: { quantidadeMin: { gt: 0 } },
    include: {
      item: {
        select: {
          codigo: true,
          descricao: true,
          unidadeMedida: true,
          unidade: { select: { sigla: true } },
          tipoProduto: { select: { nome: true } },
        },
      },
      localEstoque: { select: { nome: true } },
    },
    orderBy: [{ item: { descricao: "asc" } }],
  });

  const itens = candidatos.filter(
    (ei) => parseFloat(String(ei.quantidadeAtual)) < parseFloat(String(ei.quantidadeMin))
  );

  const dateLabel = new Date().toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
  });

  const pdfBuffer = await generatePDF(itens, dateLabel);

  const captionLines: string[] = [
    `🚨 *Produtos Abaixo do Estoque Mínimo — ${escMD(dateLabel)}*`,
    ``,
    `*${itens.length}* ite${itens.length !== 1 ? "ns" : "m"} abaixo do mínimo`,
  ];

  if (itens.length === 0) {
    captionLines.push(``, `✅ _Nenhum produto abaixo do estoque mínimo\\._`);
  }

  return {
    pdfBuffer,
    captionText: captionLines.join("\n"),
    totalItens: itens.length,
    isEmpty: itens.length === 0,
  };
}

// ── PDF Generator ─────────────────────────────────────────────────────────────

type EstoqueItemData = Awaited<ReturnType<typeof prisma.estoqueItem.findMany<{
  where: { quantidadeMin: { gt: number } };
  include: {
    item: {
      select: {
        codigo: true;
        descricao: true;
        unidadeMedida: true;
        unidade: { select: { sigla: true } };
        tipoProduto: { select: { nome: true } };
      };
    };
    localEstoque: { select: { nome: true } };
  };
}>>>;

async function generatePDF(itens: EstoqueItemData, dateLabel: string): Promise<Buffer> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc  = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.setFillColor(185, 28, 28); // red-700
  doc.rect(0, 0, pageW, 22, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("PRODUTOS ABAIXO DO ESTOQUE MÍNIMO", 14, 10);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Gerado em: ${dateLabel}`, 14, 17);
  doc.text(`Total: ${itens.length} iten${itens.length !== 1 ? "s" : ""}`, pageW - 14, 17, { align: "right" });

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (itens.length === 0) {
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(12);
    doc.setFont("helvetica", "italic");
    doc.text("Nenhum produto abaixo do estoque mínimo.", pageW / 2, 60, { align: "center" });
    return Buffer.from(doc.output("arraybuffer"));
  }

  // ── Table ────────────────────────────────────────────────────────────────────
  const rows = itens.map((ei) => {
    const un       = ei.item.unidade?.sigla ?? ei.item.unidadeMedida ?? "UN";
    const atual    = parseFloat(String(ei.quantidadeAtual));
    const min      = parseFloat(String(ei.quantidadeMin));
    const deficit  = min - atual;
    const fmtNum   = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
    const pct      = min > 0 ? Math.round((atual / min) * 100) : 0;

    return [
      ei.item.codigo ?? "—",
      ei.item.descricao,
      ei.item.tipoProduto?.nome ?? "—",
      ei.localEstoque?.nome ?? "—",
      `${fmtNum(atual)} ${un}`,
      `${fmtNum(min)} ${un}`,
      `${fmtNum(deficit)} ${un}`,
      `${pct}%`,
    ];
  });

  autoTable(doc, {
    startY: 28,
    head: [["Código", "Descrição", "Categoria", "Local de Estoque", "Saldo Atual", "Mínimo", "Déficit", "% do Min."]],
    body: rows,
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [185, 28, 28],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: [254, 242, 242] }, // red-50
    columnStyles: {
      0: { cellWidth: 24, font: "courier", fontSize: 7, textColor: [60, 60, 60] },
      1: { cellWidth: "auto" },
      2: { cellWidth: 28 },
      3: { cellWidth: 36 },
      4: { cellWidth: 26, halign: "right", textColor: [185, 28, 28], fontStyle: "bold" },
      5: { cellWidth: 26, halign: "right" },
      6: { cellWidth: 26, halign: "right", textColor: [220, 38, 38] },
      7: { cellWidth: 18, halign: "center" },
    },
    didParseCell: (data) => {
      if (data.column.index === 7 && data.section === "body") {
        const pct = parseInt(String(data.cell.raw).replace("%", ""), 10);
        if (pct === 0) {
          data.cell.styles.textColor = [185, 28, 28];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
    margin: { left: 10, right: 10 },
  });

  // ── Footer ───────────────────────────────────────────────────────────────────
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
