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

/** Monta o PDF do orçamento (modelo DAV) e devolve o blob + nome do arquivo. */
export async function gerarPedidoPDFBlob(p: PedidoPrintData): Promise<{ blob: Blob; nome: string }> {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 14;
  let y = 16;

  // Título
  doc.setFont("helvetica", "bold"); doc.setFontSize(15);
  doc.text(tituloPedido(p), pageW / 2, y, { align: "center" });
  y += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(120);
  doc.text("NÃO É DOCUMENTO FISCAL", pageW / 2, y, { align: "center" });
  doc.setTextColor(0);
  y += 6;

  // Empresa
  if (p.empresa) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text(p.empresa.nomeFantasia || p.empresa.razaoSocial, M, y);
    y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    if (p.empresa.cnpj) { doc.text(`CNPJ: ${p.empresa.cnpj}`, M, y); y += 4; }
    const end = enderecoLinha(p.empresa);
    if (end) { doc.text(end, M, y); y += 4; }
    if (p.empresa.telefone) { doc.text(`Fone: ${p.empresa.telefone}`, M, y); y += 4; }
  }

  // Linha de separação
  y += 1;
  doc.setDrawColor(200); doc.line(M, y, pageW - M, y); y += 5;

  // Meta: número, data, pagamento
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text(`Documento: ${p.numero}`, M, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(`Data: ${fmtData(p.dataEmissao)}`, pageW - M, y, { align: "right" });
  y += 5;
  const pag = [p.formaPagamento, p.condicaoPagamento].filter(Boolean).join(" · ");
  if (pag) { doc.text(`Pagamento: ${pag}`, M, y); y += 5; }

  // Cliente
  doc.setFont("helvetica", "bold");
  doc.text(`Cliente: ${p.cliente.razaoSocial}${p.cliente.nomeFantasia ? ` (${p.cliente.nomeFantasia})` : ""}`, M, y);
  y += 4;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  if (p.cliente.cpfCnpj) { doc.text(`CPF/CNPJ: ${p.cliente.cpfCnpj}`, M, y); y += 4; }
  const endCli = enderecoLinha(p.cliente);
  if (endCli) { doc.text(endCli, M, y); y += 4; }
  y += 2;

  // Tabela de itens
  autoTable(doc, {
    startY: y,
    head: [["Código", "Descrição", "UN", "Quant.", "Pr. Unit.", "Desc.", "TOTAL"]],
    body: p.itens.map((it) => [
      it.codigo,
      it.descricao,
      it.un,
      qtde(it.quantidade),
      brl(it.precoUnitario),
      brl(it.valorDesconto),
      brl(it.valorTotal),
    ]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 20 },
      2: { cellWidth: 12, halign: "center" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right", fontStyle: "bold" },
    },
    margin: { left: M, right: M },
  });

  // Totais
  // @ts-expect-error lastAutoTable é adicionado pelo plugin autotable
  let yt = (doc.lastAutoTable?.finalY ?? y) + 6;
  const dirX = pageW - M;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(`Itens: R$ ${brl(p.valorProdutos)}`, dirX, yt, { align: "right" }); yt += 5;
  if (p.valorDesconto > 0) { doc.text(`Desconto: R$ ${brl(p.valorDesconto)}`, dirX, yt, { align: "right" }); yt += 5; }
  if (p.valorFrete > 0) { doc.text(`Frete: R$ ${brl(p.valorFrete)}`, dirX, yt, { align: "right" }); yt += 5; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text(`TOTAL: R$ ${brl(p.valorTotal)}`, dirX, yt, { align: "right" });

  if (p.observacoes) {
    yt += 8;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    doc.text(`Obs: ${p.observacoes}`, M, yt, { maxWidth: pageW - 2 * M });
  }

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
