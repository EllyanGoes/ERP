// Geração do orçamento/pedido em PDF (client-side, jsPDF + autotable) e envio
// pelo WhatsApp. No celular/tablet usa a Web Share API (abre o compartilhar
// nativo com o PDF anexado → o vendedor escolhe o WhatsApp); no desktop sem
// suporte, baixa o PDF e abre o WhatsApp com a mensagem (anexo manual).
import { buildPedidoWhatsAppText, telWhatsApp, type PedidoPrintData } from "@/lib/print-pedido";

const brl = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtde = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

function fmtData(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "-" : d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function enderecoLinha(e: { logradouro: string | null; numero: string | null; bairro: string | null; cidade: string | null; estado: string | null }): string {
  const p1 = [e.logradouro, e.numero].filter(Boolean).join(", ");
  const p2 = [e.bairro, [e.cidade, e.estado].filter(Boolean).join("/")].filter(Boolean).join(" - ");
  return [p1, p2].filter(Boolean).join(" — ");
}

function tituloPedido(p: PedidoPrintData): string {
  return p.status === "ORCAMENTO" ? "ORÇAMENTO" : "PEDIDO DE VENDA";
}

/**
 * Monta o PDF do orçamento no MESMO modelo da folha A4 (Documento Auxiliar de
 * Venda) porém colorido — moldura azul, faixas de cabeçalho, tabela com
 * cabeçalho azul e linhas zebradas, total em destaque, assinaturas.
 */
export async function gerarPedidoPDFBlob(p: PedidoPrintData): Promise<{ blob: Blob; nome: string }> {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  // Paleta (mesma do A4 colorido)
  const AZUL: [number, number, number] = [37, 99, 235];
  const AZUL_ESC: [number, number, number] = [30, 58, 138];
  const AZUL_CLR: [number, number, number] = [239, 246, 255];
  const AZUL_BORDA: [number, number, number] = [191, 219, 254];
  const CINZA_CLR: [number, number, number] = [248, 250, 252];
  const VERM_FUNDO: [number, number, number] = [254, 242, 242];
  const VERM_TXT: [number, number, number] = [185, 28, 28];
  const TINTA: [number, number, number] = [15, 23, 42];

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 12;
  const W = pageW - 2 * M;
  const x0 = M;
  const yTop = M;
  let y = yTop;

  // ── Cabeçalho (faixas dentro da moldura) ──────────────────────────────────
  // Título — faixa azul
  doc.setFillColor(...AZUL); doc.rect(x0, y, W, 9, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text(tituloPedido(p), x0 + W / 2, y + 6, { align: "center" });
  y += 9;

  // Aviso — faixa vermelha clara
  doc.setFillColor(...VERM_FUNDO); doc.rect(x0, y, W, 7, "F");
  doc.setTextColor(...VERM_TXT); doc.setFont("helvetica", "bold"); doc.setFontSize(7);
  doc.text("NÃO É DOCUMENTO FISCAL — NÃO É VÁLIDO COMO RECIBO/GARANTIA — NÃO COMPROVA PAGAMENTO", x0 + W / 2, y + 4.5, { align: "center" });
  y += 7;

  // Empresa — faixa azul clara, centralizada
  if (p.empresa) {
    const end = enderecoLinha(p.empresa);
    const linhas = [
      `${p.empresa.razaoSocial}${p.empresa.cnpj ? ` — CPF/CNPJ: ${p.empresa.cnpj}` : ""}`,
      end,
      p.empresa.telefone ? `FONE: ${p.empresa.telefone}` : "",
    ].filter(Boolean);
    const h = 3 + linhas.length * 4;
    doc.setFillColor(...AZUL_CLR); doc.rect(x0, y, W, h, "F");
    let yy = y + 4.5;
    linhas.forEach((ln, i) => {
      if (i === 0) { doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...AZUL_ESC); }
      else { doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...TINTA); }
      doc.text(ln, x0 + W / 2, yy, { align: "center" });
      yy += 4;
    });
    y += h;
    doc.setDrawColor(...AZUL_BORDA); doc.line(x0, y, x0 + W, y);
  }

  // Meta — data/pagamento + cliente + endereço
  const metaLinhas: Array<{ txt: string; bold?: boolean }> = [];
  const pag = [
    `Data: ${fmtData(p.dataEmissao)}`,
    p.formaPagamento ? `Pagamento: ${p.formaPagamento}` : "",
    p.condicaoPagamento ? `Condição: ${p.condicaoPagamento}` : "",
    p.vendedor ? `Vendedor: ${p.vendedor}` : "",
  ].filter(Boolean).join("    ");
  metaLinhas.push({ txt: pag });
  metaLinhas.push({ txt: `Cliente: ${p.cliente.razaoSocial}${p.cliente.nomeFantasia ? ` (${p.cliente.nomeFantasia})` : ""}${p.cliente.cpfCnpj ? ` — ${p.cliente.cpfCnpj}` : ""}`, bold: true });
  const endCli = enderecoLinha(p.cliente);
  metaLinhas.push({ txt: `Endereço: ${endCli || "—"}` });
  const hMeta = 2 + metaLinhas.length * 4.2;
  doc.setFillColor(255, 255, 255); doc.rect(x0, y, W, hMeta, "F");
  let ym = y + 4.5;
  metaLinhas.forEach((l) => {
    doc.setFont("helvetica", l.bold ? "bold" : "normal"); doc.setFontSize(8.5);
    doc.setTextColor(...(l.bold ? AZUL_ESC : TINTA));
    doc.text(l.txt, x0 + 2, ym, { maxWidth: W - 4 });
    ym += 4.2;
  });
  y += hMeta;
  doc.setDrawColor(...AZUL_BORDA); doc.line(x0, y, x0 + W, y);

  // Docnum — faixa cinza
  doc.setFillColor(...CINZA_CLR); doc.rect(x0, y, W, 7, "F");
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...TINTA);
  doc.text(`Nº do Documento: ${p.numero}`, x0 + 2, y + 4.5);
  doc.text("Nº do Documento Fiscal: ____________", x0 + W / 2 + 2, y + 4.5);
  doc.setDrawColor(...AZUL_BORDA); doc.line(x0 + W / 2, y, x0 + W / 2, y + 7);
  y += 7;

  // ── Tabela de itens ───────────────────────────────────────────────────────
  autoTable(doc, {
    startY: y,
    head: [["Código", "Descrição", "UN", "Quant.", "Preço Unit.", "Preço", "Desc.", "TOTAL R$"]],
    body: p.itens.map((it) => [
      it.codigo,
      it.descricao,
      it.un,
      qtde(it.quantidade),
      brl(it.precoUnitario),
      brl(it.quantidade * it.precoUnitario),
      brl(it.valorDesconto),
      brl(it.valorTotal),
    ]),
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.4, lineColor: [226, 232, 240], lineWidth: 0.1, textColor: TINTA },
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: "bold", lineColor: [29, 78, 216], halign: "center" },
    alternateRowStyles: { fillColor: CINZA_CLR },
    columnStyles: {
      0: { cellWidth: 18 },
      2: { cellWidth: 10, halign: "center" },
      3: { cellWidth: 16, halign: "right" },
      4: { cellWidth: 20, halign: "right" },
      5: { cellWidth: 20, halign: "right" },
      6: { cellWidth: 15, halign: "right" },
      7: { cellWidth: 22, halign: "right", fontStyle: "bold", textColor: AZUL_ESC },
    },
    margin: { left: M, right: M },
  });

  // @ts-expect-error lastAutoTable é adicionado pelo plugin autotable
  const fimTabela: number = doc.lastAutoTable?.finalY ?? y;

  // ── Moldura externa azul (envolve cabeçalho + tabela) ─────────────────────
  doc.setDrawColor(...AZUL); doc.setLineWidth(0.5);
  doc.rect(x0, yTop, W, fimTabela - yTop);
  doc.setLineWidth(0.2);

  // ── Totais (à direita) ────────────────────────────────────────────────────
  let yt = fimTabela + 7;
  const dirX = pageW - M;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...TINTA);
  doc.text(`Itens R$: ${brl(p.valorProdutos)}`, dirX, yt, { align: "right" }); yt += 5;
  if (p.valorDesconto > 0) { doc.text(`Desconto R$: ${brl(p.valorDesconto)}`, dirX, yt, { align: "right" }); yt += 5; }
  if (p.valorFrete > 0) { doc.text(`Frete R$: ${brl(p.valorFrete)}`, dirX, yt, { align: "right" }); yt += 5; }
  // TOTAL em caixa azul
  const totalTxt = `TOTAL R$: ${brl(p.valorTotal)}`;
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  const tw = doc.getTextWidth(totalTxt) + 8;
  doc.setFillColor(...AZUL); doc.roundedRect(dirX - tw, yt - 1, tw, 8, 1, 1, "F");
  doc.setTextColor(255, 255, 255);
  doc.text(totalTxt, dirX - 4, yt + 4.5, { align: "right" });
  doc.setTextColor(...TINTA);

  // Observações (à esquerda, na mesma faixa dos totais)
  if (p.observacoes) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(71, 85, 105);
    doc.text(`Obs: ${p.observacoes}`, M, fimTabela + 7, { maxWidth: W - 70 });
  }

  // ── Assinaturas ───────────────────────────────────────────────────────────
  const yAss = yt + 26;
  const colW = (W - 18) / 2;
  doc.setDrawColor(148, 163, 184);
  doc.line(M, yAss, M + colW, yAss);
  doc.line(M + colW + 18, yAss, M + W, yAss);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(71, 85, 105);
  const empresaNome = p.empresa ? (p.empresa.nomeFantasia || p.empresa.razaoSocial) : "";
  doc.text(empresaNome, M + colW / 2, yAss + 4, { align: "center" });
  doc.text(p.cliente.nomeFantasia || p.cliente.razaoSocial, M + colW + 18 + colW / 2, yAss + 4, { align: "center" });

  doc.setFontSize(8); doc.setTextColor(148, 163, 184);
  doc.text("É vedada a autenticação deste documento", pageW / 2, yAss + 14, { align: "center" });

  const blob = doc.output("blob");
  const nome = `${tituloPedido(p).toLowerCase().replace(/\s+/g, "-")}-${p.numero}.pdf`;
  return { blob, nome };
}

/**
 * Envia o orçamento em PDF pelo WhatsApp. Mobile: Web Share API com o arquivo
 * (anexa o PDF de verdade). Desktop/sem suporte: baixa o PDF e abre o WhatsApp
 * com a mensagem para o vendedor anexar.
 */
export async function enviarPedidoWhatsAppPDF(p: PedidoPrintData): Promise<void> {
  const { blob, nome } = await gerarPedidoPDFBlob(p);
  const file = new File([blob], nome, { type: "application/pdf" });
  const texto = buildPedidoWhatsAppText(p);

  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (typeof navigator.share === "function" && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: texto, title: nome });
      return;
    } catch (e) {
      // usuário cancelou o compartilhamento → não cai no fallback
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
  }

  // Fallback: baixa o PDF e abre o WhatsApp com a mensagem (anexo manual).
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);

  const tel = telWhatsApp(p.cliente.telefone);
  const waUrl = tel
    ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`
    : `https://wa.me/?text=${encodeURIComponent(texto)}`;
  window.open(waUrl, "_blank");
}
