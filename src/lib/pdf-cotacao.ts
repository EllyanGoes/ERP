// Resumo da cotação em PDF (server-side, jsPDF + autoTable). Gerado no envio da
// aprovação CT→PC para anexar no Telegram, dando ao aprovador o comparativo dos
// fornecedores e o detalhamento do vencedor antes de aprovar/reprovar.
import { prismaSemEscopo } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";

const brl = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtde = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const nomeForn = (f: { razaoSocial: string; nomeFantasia: string | null }) => f.nomeFantasia || f.razaoSocial;

/**
 * Gera o PDF de resumo de uma cotação: comparativo dos fornecedores que
 * responderam (ordenados pelo total) com o vencedor destacado + o detalhamento
 * dos itens do vencedor. Retorna null se a cotação não existir.
 */
export async function buildCotacaoPDF(cotacaoId: string): Promise<{ buffer: Buffer; filename: string } | null> {
  const cot = await prismaSemEscopo.cotacaoCompra.findUnique({
    where: { id: cotacaoId },
    include: {
      necessidade: { select: { numero: true } },
      fornecedores: {
        where: { status: "RESPONDIDA" },
        include: {
          fornecedor: { select: { razaoSocial: true, nomeFantasia: true, cpfCnpj: true } },
          itens: { include: { item: { select: { codigo: true, descricao: true, unidadeMedida: true, unidade: { select: { sigla: true } } } } } },
        },
      },
    },
  });
  if (!cot) return null;

  // Ordena pelo total (menor primeiro); o vencedor é o melhorOpcao marcado na
  // submissão ou, na ausência, o de menor total.
  const respondidas = [...cot.fornecedores].sort(
    (a, b) => decimalToNumber(a.totalCalculado) - decimalToNumber(b.totalCalculado),
  );
  const vencedor = respondidas.find((f) => f.melhorOpcao) ?? respondidas[0] ?? null;
  const ref = cot.nome || cot.necessidade?.numero || cot.numero;

  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const AZUL: [number, number, number] = [37, 99, 235];
  const AZUL_ESC: [number, number, number] = [30, 58, 138];
  const VERDE_CLR: [number, number, number] = [220, 252, 231];
  const CINZA_CLR: [number, number, number] = [248, 250, 252];
  const TINTA: [number, number, number] = [15, 23, 42];

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 12;
  const W = pageW - 2 * M;

  // Cabeçalho
  doc.setFillColor(...AZUL); doc.rect(0, 0, pageW, 20, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(14);
  doc.text("RESUMO DA COTAÇÃO", M, 10);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  const dataLabel = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  doc.text(`Cotação: ${ref}   ·   Nº ${cot.numero}   ·   ${dataLabel}`, M, 16);

  let y = 28;
  doc.setTextColor(...TINTA); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("Comparativo de fornecedores", M, y);
  y += 2;

  // Comparativo dos fornecedores
  autoTable(doc, {
    startY: y + 2,
    head: [["#", "Fornecedor", "Prazo", "Cond. pagto", "Frete R$", "Total R$"]],
    body: respondidas.map((f, i) => [
      String(i + 1),
      f.id === vencedor?.id ? `${nomeForn(f.fornecedor)}  (melhor)` : nomeForn(f.fornecedor),
      f.prazoEntregaDias != null ? `${f.prazoEntregaDias} d` : "—",
      f.condicoesPagamento || "—",
      brl(decimalToNumber(f.frete)),
      brl(decimalToNumber(f.totalCalculado)),
    ]),
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 1.6, lineColor: [226, 232, 240], lineWidth: 0.1, textColor: TINTA },
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: "bold", halign: "center" },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      2: { cellWidth: 16, halign: "center" },
      4: { cellWidth: 24, halign: "right" },
      5: { cellWidth: 28, halign: "right", fontStyle: "bold", textColor: AZUL_ESC },
    },
    // Destaca a linha do vencedor em verde claro.
    didParseCell: (data) => {
      if (data.section === "body" && respondidas[data.row.index]?.id === vencedor?.id) {
        data.cell.styles.fillColor = VERDE_CLR;
      }
    },
    margin: { left: M, right: M },
  });

  // @ts-expect-error lastAutoTable é adicionado pelo plugin autotable
  y = (doc.lastAutoTable?.finalY ?? y) + 10;

  // Detalhamento do vencedor
  if (vencedor) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...TINTA);
    doc.text(`Itens do vencedor — ${nomeForn(vencedor.fornecedor)}`, M, y);
    if (vencedor.fornecedor.cpfCnpj) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
      doc.text(`CNPJ: ${vencedor.fornecedor.cpfCnpj}`, M, y + 4.5);
    }
    autoTable(doc, {
      startY: y + 7,
      head: [["Código", "Descrição", "UN", "Qtd.", "Preço Unit.", "Subtotal R$"]],
      body: vencedor.itens.map((it) => [
        it.item.codigo,
        it.item.descricao,
        it.item.unidade?.sigla ?? it.item.unidadeMedida ?? "—",
        qtde(decimalToNumber(it.quantidade)),
        brl(decimalToNumber(it.precoUnitario)),
        brl(decimalToNumber(it.subtotal)),
      ]),
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 1.4, lineColor: [226, 232, 240], lineWidth: 0.1, textColor: TINTA },
      headStyles: { fillColor: AZUL_ESC, textColor: 255, fontStyle: "bold", halign: "center" },
      alternateRowStyles: { fillColor: CINZA_CLR },
      columnStyles: {
        0: { cellWidth: 22 },
        2: { cellWidth: 12, halign: "center" },
        3: { cellWidth: 18, halign: "right" },
        4: { cellWidth: 24, halign: "right" },
        5: { cellWidth: 26, halign: "right", fontStyle: "bold", textColor: AZUL_ESC },
      },
      margin: { left: M, right: M },
    });
    // @ts-expect-error lastAutoTable é adicionado pelo plugin autotable
    y = (doc.lastAutoTable?.finalY ?? y) + 8;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...AZUL_ESC);
    doc.text(`Total do vencedor: R$ ${brl(decimalToNumber(vencedor.totalCalculado))}`, pageW - M, y, { align: "right" });
  }

  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(150, 150, 150);
  doc.text(`ERP — resumo gerado em ${dataLabel} para aprovação CT→PC`, pageW / 2, doc.internal.pageSize.getHeight() - 6, { align: "center" });

  const buffer = Buffer.from(doc.output("arraybuffer"));
  const filename = `cotacao-${(cot.numero || ref).toString().replace(/[^\w-]+/g, "_")}.pdf`;
  return { buffer, filename };
}
