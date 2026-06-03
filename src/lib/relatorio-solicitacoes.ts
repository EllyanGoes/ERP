/**
 * Gera o relatório de Solicitações de Compras em PDF (jsPDF + autoTable)
 * excluindo as já totalmente atendidas.
 * Agrupado por filial.
 *
 * Status incluídos: RASCUNHO, AGUARDANDO_APROVACAO, APROVADA, EM_COTACAO, EM_PEDIDO, PARCIALMENTE_ATENDIDA
 * Status excluídos: TOTALMENTE_ATENDIDA, REJEITADA
 */

import { prisma } from "@/lib/prisma";
import { escMD } from "@/lib/telegram";

export interface RelatorioSolicitacoesResult {
  pdfBuffer: Buffer;
  captionText: string;
  totalSCs: number;
  totalItens: number;
}

// ── Status meta ───────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: [number, number, number] }> = {
  RASCUNHO:              { label: "Rascunho",       color: [156, 163, 175] },
  AGUARDANDO_APROVACAO:  { label: "Ag. Aprovação",  color: [234, 179,   8] },
  APROVADA:              { label: "Aprovada",        color: [22,  163,  74] },
  EM_COTACAO:            { label: "Em Cotação",      color: [37,   99, 235] },
  EM_PEDIDO:             { label: "Em Pedido",       color: [79,   70, 229] },
  PARCIALMENTE_ATENDIDA: { label: "Parc. Atendida", color: [249, 115,  22] },
};

const PRIORIDADE_LABEL: Record<number, string> = { 1: "Alta", 2: "Alta", 3: "Média", 4: "Alta", 5: "Baixa" };

// Marcador especial para linhas de cabeçalho de grupo
const GROUP_MARKER = "__GROUP__";

// ── Query ─────────────────────────────────────────────────────────────────────

export async function buildRelatorioSolicitacoes(): Promise<RelatorioSolicitacoesResult> {
  const scs = await prisma.necessidadeCompra.findMany({
    where: {
      status: { notIn: ["TOTALMENTE_ATENDIDA", "REJEITADA"] },
    },
    include: {
      itens: {
        include: {
          item: {
            select: {
              codigo: true,
              descricao: true,
              unidade: { select: { sigla: true } },
              unidadeMedida: true,
            },
          },
        },
      },
      setor:         { select: { nome: true } },
      filial:        { select: { razaoSocial: true, nomeFantasia: true } },
      cotacoes:      { select: { numero: true, status: true }, orderBy: { createdAt: "desc" }, take: 1 },
      pedidosCompra: { select: { numero: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: [
      { filial: { nomeFantasia: "asc" } },
      { prioridade: "asc" },
      { createdAt: "desc" },
    ],
  });

  const totalItens = scs.reduce((s, sc) => s + sc.itens.length, 0);
  const dateLabel  = new Date().toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
  });

  const contadores: Record<string, number> = {};
  for (const sc of scs) contadores[sc.status] = (contadores[sc.status] ?? 0) + 1;

  const pdfBuffer = await generatePDF(scs, dateLabel);

  // ── Caption MarkdownV2 ─────────────────────────────────────────────────────
  const captionLines: string[] = [
    `📋 *Solicitações de Compras — ${escMD(dateLabel)}*`,
    ``,
    `*${scs.length}* solicitaç${scs.length !== 1 ? "ões" : "ão"} ativas · *${totalItens}* ite${totalItens !== 1 ? "ns" : "m"}`,
  ];

  const partes: string[] = [];
  if (contadores.RASCUNHO)              partes.push(`${contadores.RASCUNHO} rascunho${contadores.RASCUNHO > 1 ? "s" : ""}`);
  if (contadores.AGUARDANDO_APROVACAO)  partes.push(`${contadores.AGUARDANDO_APROVACAO} ag\\. aprovação`);
  if (contadores.APROVADA)              partes.push(`${contadores.APROVADA} aprovada${contadores.APROVADA > 1 ? "s" : ""}`);
  if (contadores.EM_COTACAO)            partes.push(`${contadores.EM_COTACAO} em cotação`);
  if (contadores.EM_PEDIDO)             partes.push(`${contadores.EM_PEDIDO} em pedido`);
  if (contadores.PARCIALMENTE_ATENDIDA) partes.push(`${contadores.PARCIALMENTE_ATENDIDA} parc\\. atendida${contadores.PARCIALMENTE_ATENDIDA > 1 ? "s" : ""}`);
  if (partes.length > 0) captionLines.push(partes.join(" · "));
  if (scs.length === 0) captionLines.push(``, `✅ _Nenhuma solicitação ativa no momento\\._`);

  return { pdfBuffer, captionText: captionLines.join("\n"), totalSCs: scs.length, totalItens };
}

// ── PDF Generator ─────────────────────────────────────────────────────────────

type SCData = Awaited<ReturnType<typeof prisma.necessidadeCompra.findMany<{
  include: {
    itens: { include: { item: { select: { codigo: true; descricao: true; unidade: { select: { sigla: true } }; unidadeMedida: true } } } };
    setor:         { select: { nome: true } };
    filial:        { select: { razaoSocial: true; nomeFantasia: true } };
    cotacoes:      { select: { numero: true; status: true } };
    pedidosCompra: { select: { numero: true } };
  };
}>>>;

// Columns: SC · Status · Setor · Solicitante · Código · Descrição · Qtd. · Prioridade · Criado em · Cotação · Pedido
const NUM_COLS = 11;

async function generatePDF(scs: SCData, dateLabel: string): Promise<Buffer> {
  const { default: jsPDF }     = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc   = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageW, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("RELATÓRIO — SOLICITAÇÕES DE COMPRAS ATIVAS", 14, 10);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Gerado em: ${dateLabel}`, 14, 17);
  doc.text(
    `Total: ${scs.length} SC(s) · ${scs.reduce((s, sc) => s + sc.itens.length, 0)} item(ns)`,
    pageW - 14, 17, { align: "right" }
  );

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (scs.length === 0) {
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(12);
    doc.setFont("helvetica", "italic");
    doc.text("Nenhuma solicitação ativa no momento.", pageW / 2, 60, { align: "center" });
    return Buffer.from(doc.output("arraybuffer"));
  }

  // ── Agrupar por filial ───────────────────────────────────────────────────────
  const grupos = new Map<string, typeof scs>();
  for (const sc of scs) {
    const key = sc.filial?.nomeFantasia || sc.filial?.razaoSocial || "Sem filial";
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key)!.push(sc);
  }

  // ── Montar linhas com cabeçalhos de grupo ────────────────────────────────────
  type TableRow = string[];
  const rows: TableRow[] = [];
  // Índice de cada linha de grupo para usar em didParseCell
  const groupRowIndices = new Set<number>();

  for (const [filialNome, grupo] of Array.from(grupos.entries())) {
    // Linha de cabeçalho do grupo
    const groupRow: TableRow = Array(NUM_COLS).fill("");
    groupRow[0] = GROUP_MARKER;
    groupRow[1] = filialNome;
    groupRowIndices.add(rows.length);
    rows.push(groupRow);

    for (const sc of grupo) {
      const setor      = sc.setor?.nome || "—";
      const solicitante = sc.solicitante || "—";
      const prio       = PRIORIDADE_LABEL[sc.prioridade] ?? "Média";
      const criado     = new Date(sc.createdAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
      const cotacao    = sc.cotacoes[0]?.numero ?? "—";
      const pedido     = sc.pedidosCompra[0]?.numero ?? "—";
      const statusMeta = STATUS_META[sc.status] ?? { label: sc.status, color: [100, 100, 100] as [number, number, number] };

      if (sc.itens.length === 0) {
        rows.push([sc.numero, statusMeta.label, setor, solicitante, "—", "—", "—", prio, criado, cotacao, pedido]);
        continue;
      }

      sc.itens.forEach((it: typeof sc.itens[0], idx: number) => {
        const unidade = it.item.unidade?.sigla || it.item.unidadeMedida || "UN";
        const qty     = parseFloat(it.quantidade.toString()).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
        rows.push([
          idx === 0 ? sc.numero        : "",
          idx === 0 ? statusMeta.label : "",
          idx === 0 ? setor            : "",
          idx === 0 ? solicitante      : "",
          it.item.codigo,
          it.item.descricao,
          `${qty} ${unidade}`,
          idx === 0 ? prio             : "",
          idx === 0 ? criado           : "",
          idx === 0 ? cotacao          : "",
          idx === 0 ? pedido           : "",
        ]);
      });
    }
  }

  autoTable(doc, {
    startY: 26,
    head: [["Solicitação", "Status", "Setor", "Solicitante", "Código", "Descrição", "Qtd.", "Prioridade", "Criado em", "Cotação", "Pedido"]],
    body: rows,
    styles: {
      fontSize: 7,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize:  7,
    },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0:  { cellWidth: 20, fontStyle: "bold", textColor: [37, 99, 235] },                   // SC
      1:  { cellWidth: 24, halign: "center",  fontStyle: "bold" },                           // Status
      2:  { cellWidth: 22 },                                                                  // Setor
      3:  { cellWidth: 28 },                                                                  // Solicitante
      4:  { cellWidth: 20, font: "courier", fontSize: 6.5, textColor: [60, 60, 60] },        // Código
      5:  { cellWidth: "auto" },                                                              // Descrição
      6:  { cellWidth: 18, halign: "right" },                                                 // Qtd.
      7:  { cellWidth: 17, halign: "center" },                                                // Prioridade
      8:  { cellWidth: 20, halign: "center" },                                                // Criado em
      9:  { cellWidth: 20, halign: "center", textColor: [37, 99, 235], fontStyle: "bold" },  // Cotação
      10: { cellWidth: 20, halign: "center", textColor: [22, 163, 74],  fontStyle: "bold" }, // Pedido
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;

      // ── Linha de cabeçalho de grupo ──────────────────────────────────────────
      if (groupRowIndices.has(data.row.index)) {
        if (data.column.index === 0) {
          // Célula invisível (marcador)
          data.cell.text = [];
          (data.cell.styles as unknown as Record<string, unknown>).fillColor   = [226, 232, 240];
          data.cell.styles.cellPadding = 0;
        } else if (data.column.index === 1) {
          // Nome da filial
          data.cell.styles.fontStyle  = "bold";
          data.cell.styles.fontSize   = 8;
          data.cell.styles.textColor  = [30, 58, 138];
          (data.cell.styles as unknown as Record<string, unknown>).fillColor   = [226, 232, 240];
          data.cell.styles.halign     = "left";
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (data.cell as any).colSpan  = NUM_COLS - 1;
        } else {
          // Demais células da linha de grupo — fundo igual, sem texto
          (data.cell.styles as unknown as Record<string, unknown>).fillColor = [226, 232, 240];
          data.cell.text = [];
        }
        return;
      }

      // ── Status colorido ───────────────────────────────────────────────────────
      if (data.column.index === 1 && data.cell.raw !== "") {
        const meta = Object.values(STATUS_META).find((m) => m.label === String(data.cell.raw));
        if (meta) data.cell.styles.textColor = meta.color;
      }

      // ── Prioridade Alta em vermelho ───────────────────────────────────────────
      if (data.column.index === 7 && data.cell.raw === "Alta") {
        data.cell.styles.textColor = [185, 28, 28];
        data.cell.styles.fontStyle = "bold";
      }

      // ── Fundo branco nas linhas de continuação ────────────────────────────────
      if (data.column.index === 0 && data.cell.raw === "") {
        (data.cell.styles as unknown as Record<string, unknown>).fillColor = [255, 255, 255];
      }
    },
    margin: { left: 8, right: 8 },
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
