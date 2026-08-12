// Resumo da cotação em PDF (server-side, jsPDF + autoTable). Gerado no envio da
// aprovação CT→PC para anexar no Telegram, dando ao aprovador o comparativo dos
// fornecedores no MESMO formato de matriz da tela da cotação (itens nas linhas,
// um fornecedor por coluna, composição do total no rodapé). Página em paisagem.
import { prismaSemEscopo } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";

const brl = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtde = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const nomeForn = (f: { razaoSocial: string; nomeFantasia: string | null }) => f.nomeFantasia || f.razaoSocial;

/**
 * Gera o PDF de resumo de uma cotação: matriz comparativa (itens × fornecedores
 * respondidos, menor preço por item e vencedor destacados) com subtotal,
 * desconto, frete, impostos, total, prazo e condição de pagamento por coluna.
 * Retorna null se a cotação não existir.
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
  const VERDE_ESC: [number, number, number] = [22, 101, 52];
  const CINZA_TXT: [number, number, number] = [100, 116, 139];
  const TINTA: [number, number, number] = [15, 23, 42];

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 12;

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
  if (vencedor) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...CINZA_TXT);
    doc.text(`Melhor preço: ${nomeForn(vencedor.fornecedor)}${vencedor.fornecedor.cpfCnpj ? ` · CNPJ ${vencedor.fornecedor.cpfCnpj}` : ""}`, M, y + 4.5);
    y += 4.5;
  }

  // ── Matriz: itens nas linhas, um fornecedor por coluna ─────────────────────
  type ItemInfo = { codigo: string; descricao: string; um: string; qtd: number };
  const allItems = new Map<string, ItemInfo>();
  respondidas.forEach((f) =>
    f.itens.forEach((it) => {
      if (!allItems.has(it.itemId)) {
        allItems.set(it.itemId, {
          codigo: it.item.codigo,
          descricao: it.item.descricao,
          um: it.item.unidade?.sigla ?? it.item.unidadeMedida ?? "—",
          qtd: decimalToNumber(it.quantidade),
        });
      }
    }),
  );

  // Menor preço válido por item (para destacar em verde, como na tela)
  const menorPreco = new Map<string, number>();
  respondidas.forEach((f) =>
    f.itens.forEach((it) => {
      if (it.situacao === "NAO_CONSIDERA") return;
      const p = decimalToNumber(it.precoUnitario);
      if (p > 0 && p < (menorPreco.get(it.itemId) ?? Infinity)) menorPreco.set(it.itemId, p);
    }),
  );

  const itemIds = Array.from(allItems.keys());
  const nForn = respondidas.length;
  const vencedorCol = vencedor ? 4 + respondidas.findIndex((f) => f.id === vencedor.id) : -1;

  // Flags [linha][colunaFornecedor] de menor preço, calculadas junto do body
  const ehMenorFlag: boolean[][] = [];
  const body = itemIds.map((itemId) => {
    const info = allItems.get(itemId)!;
    const flags: boolean[] = [];
    const row: string[] = [info.codigo, info.descricao, info.um, qtde(info.qtd)];
    respondidas.forEach((f) => {
      const it = f.itens.find((i) => i.itemId === itemId);
      const preco = it ? decimalToNumber(it.precoUnitario) : 0;
      const naoCota = it?.situacao === "NAO_CONSIDERA";
      flags.push(!naoCota && preco > 0 && preco === menorPreco.get(itemId));
      row.push(naoCota ? "Não cota" : preco > 0 ? brl(preco) : "—");
    });
    ehMenorFlag.push(flags);
    return row;
  });

  // Rodapé: composição do total + condições, uma linha por métrica
  const mkFoot = (label: string, vals: string[], bold = false) => [
    { content: label, colSpan: 4, styles: { halign: "right" as const, fontStyle: "normal" as const, textColor: CINZA_TXT } },
    ...vals.map((v) => ({ content: v, styles: { halign: "right" as const, fontStyle: (bold ? "bold" : "normal") as "bold" | "normal" } })),
  ];
  const subtotalDe = (f: (typeof respondidas)[0]) =>
    f.itens.reduce((s, it) => s + (it.disponivel === false ? 0 : decimalToNumber(it.subtotal)), 0);

  const foot: ReturnType<typeof mkFoot>[] = [
    mkFoot("Subtotal dos itens R$", respondidas.map((f) => brl(subtotalDe(f)))),
    mkFoot("Desconto R$", respondidas.map((f) => {
      const v = decimalToNumber(f.vrDesconto);
      const pct = decimalToNumber(f.desconto);
      return v > 0 ? `− ${brl(v)}${pct > 0 ? ` (${pct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%)` : ""}` : "—";
    })),
    mkFoot("Frete R$", respondidas.map((f) => (decimalToNumber(f.frete) > 0 ? `+ ${brl(decimalToNumber(f.frete))}` : "—"))),
  ];
  if (respondidas.some((f) => decimalToNumber(f.despesas) > 0)) {
    foot.push(mkFoot("Despesas R$", respondidas.map((f) => (decimalToNumber(f.despesas) > 0 ? `+ ${brl(decimalToNumber(f.despesas))}` : "—"))));
  }
  if (respondidas.some((f) => decimalToNumber(f.seguro) > 0)) {
    foot.push(mkFoot("Seguro R$", respondidas.map((f) => (decimalToNumber(f.seguro) > 0 ? `+ ${brl(decimalToNumber(f.seguro))}` : "—"))));
  }
  foot.push(mkFoot("Total da proposta R$", respondidas.map((f) => brl(decimalToNumber(f.totalCalculado))), true));
  foot.push(mkFoot("Prazo de entrega", respondidas.map((f) => (f.prazoEntregaDias != null ? `${f.prazoEntregaDias} dias` : "—"))));
  foot.push(mkFoot("Condição de pagamento", respondidas.map((f) => f.condicoesPagamento || "—")));

  // Larguras: colunas fixas + fornecedores dividem o restante da paisagem
  const W = pageW - 2 * M;
  const FIXAS = { codigo: 20, um: 10, qtd: 14, descricao: 58 };
  // Cap de 65mm p/ poucas propostas não esticarem uma coluna só na página toda
  const wForn = Math.min(65, Math.max(24, (W - FIXAS.codigo - FIXAS.um - FIXAS.qtd - FIXAS.descricao) / Math.max(1, nForn)));
  const fontSize = nForn <= 5 ? 8.5 : 7.5;

  const totalRowIdx = foot.findIndex((r) => String(r[0].content).startsWith("Total da proposta"));

  autoTable(doc, {
    startY: y + 4,
    head: [[
      "Código", "Descrição", "UN", "Qtd",
      // Sem "★"/"→": a helvetica embutida do jsPDF não tem esses glifos
      ...respondidas.map((f) => (f.id === vencedor?.id ? `${nomeForn(f.fornecedor)} (melhor)` : nomeForn(f.fornecedor))),
    ]],
    body,
    foot,
    theme: "grid",
    styles: { fontSize, cellPadding: 1.6, lineColor: [226, 232, 240], lineWidth: 0.1, textColor: TINTA },
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: "bold", halign: "center", valign: "middle" },
    footStyles: { fillColor: [248, 250, 252], textColor: TINTA, fontSize: fontSize - 0.5 },
    columnStyles: {
      0: { cellWidth: FIXAS.codigo },
      1: { cellWidth: FIXAS.descricao },
      2: { cellWidth: FIXAS.um, halign: "center" },
      3: { cellWidth: FIXAS.qtd, halign: "right" },
      ...Object.fromEntries(respondidas.map((_, i) => [4 + i, { cellWidth: wForn, halign: "right" as const }])),
    },
    didParseCell: (data) => {
      const col = data.column.index;
      // Coluna do vencedor em verde claro (corpo e rodapé), como na tela
      if (col === vencedorCol && (data.section === "body" || data.section === "foot")) {
        data.cell.styles.fillColor = VERDE_CLR;
      }
      // Menor preço do item em verde escuro + negrito
      if (data.section === "body" && col >= 4 && ehMenorFlag[data.row.index]?.[col - 4]) {
        data.cell.styles.textColor = VERDE_ESC;
        data.cell.styles.fontStyle = "bold";
      }
      // Linha do total da proposta em destaque
      if (data.section === "foot" && data.row.index === totalRowIdx) {
        data.cell.styles.fontStyle = "bold";
        if (col >= 4) data.cell.styles.textColor = col === vencedorCol ? VERDE_ESC : AZUL_ESC;
      }
    },
    margin: { left: M, right: M },
  });

  // @ts-expect-error lastAutoTable é adicionado pelo plugin autotable
  y = (doc.lastAutoTable?.finalY ?? y) + 8;
  if (vencedor) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...VERDE_ESC);
    doc.text(
      `Vencedor: ${nomeForn(vencedor.fornecedor)} — Total R$ ${brl(decimalToNumber(vencedor.totalCalculado))}`,
      pageW - M, y, { align: "right" },
    );
  }

  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(150, 150, 150);
  doc.text(`ERP — resumo gerado em ${dataLabel} para aprovação da cotação`, pageW / 2, doc.internal.pageSize.getHeight() - 6, { align: "center" });

  const buffer = Buffer.from(doc.output("arraybuffer"));
  const filename = `cotacao-${(cot.numero || ref).toString().replace(/[^\w-]+/g, "_")}.pdf`;
  return { buffer, filename };
}
