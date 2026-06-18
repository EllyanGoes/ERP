// Geração de PDF formatado para os relatórios contábeis (Razão, Balancete, DRE,
// Balanço), no mesmo padrão dos PDFs dos outros módulos (jsPDF + autotable):
// título azul, empresa, período, data de emissão e tabela com cabeçalho azul.
// As células já chegam FORMATADAS (string) — a página usa fmtSaldo/fmtColuna.

export type LinhaPdf = {
  celulas: string[];
  // secao = subtotal/cabeçalho de grupo; total = linha final; normal = padrão.
  estilo?: "secao" | "total" | "normal";
};

export async function gerarPdfContabil(opts: {
  titulo: string;
  empresa?: string | null;
  subinfo?: string[];            // ex.: ["Período: 01/01/2026 a 18/06/2026"]
  head: string[];
  linhas: LinhaPdf[];
  alinharDireitaDe: number;      // índice da 1ª coluna numérica (alinha à direita)
  orientacao?: "p" | "l";
  arquivo: string;
}): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: opts.orientacao ?? "p" });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 12;

  doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(37, 99, 235);
  doc.text(opts.titulo, M, 16);
  doc.text(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), pageW - M, 16, { align: "right" });

  doc.setFont("helvetica", "normal"); doc.setTextColor(15, 23, 42);
  let y = 22;
  if (opts.empresa) { doc.setFontSize(10); doc.text(opts.empresa, M, y); y += 5; }
  doc.setFontSize(8.5); doc.setTextColor(100);
  for (const s of opts.subinfo ?? []) { doc.text(s, M, y); y += 4; }

  const columnStyles: Record<number, { halign: "right" | "left" }> = {};
  for (let i = opts.alinharDireitaDe; i < opts.head.length; i++) columnStyles[i] = { halign: "right" };

  autoTable(doc, {
    startY: y + 2,
    head: [opts.head],
    body: opts.linhas.map((l) => l.celulas),
    styles: { fontSize: opts.orientacao === "l" ? 7 : 8, cellPadding: 1.3, textColor: [15, 23, 42], overflow: "linebreak" },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
    columnStyles,
    margin: { left: M, right: M },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const linha = opts.linhas[data.row.index];
      if (linha?.estilo === "secao") { data.cell.styles.fontStyle = "bold"; data.cell.styles.fillColor = [241, 245, 249]; }
      else if (linha?.estilo === "total") { data.cell.styles.fontStyle = "bold"; data.cell.styles.fillColor = [226, 232, 240]; }
    },
  });

  doc.save(opts.arquivo);
}
