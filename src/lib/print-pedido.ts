// Impressão de Pedido de Venda em dois formatos:
//   • Bobina térmica 80mm — bytes ESC/POS (WebUSB) com fallback pelo diálogo
//     do navegador (mesmo caminho da minuta).
//   • Folha A4 — "DOCUMENTO AUXILIAR DE VENDA" no modelo fornecido pelo dono
//     (cabeçalho da empresa, tabela de itens, totais e assinaturas).

export type PedidoPrintData = {
  numero: string;
  status: string;
  dataEmissao: string | null;
  condicaoPagamento: string | null;
  formaPagamento: string | null;
  observacoes: string | null;
  valorProdutos: number;
  valorDesconto: number;
  valorFrete: number;
  valorTotal: number;
  cliente: {
    razaoSocial: string;
    nomeFantasia: string | null;
    cpfCnpj: string | null;
    logradouro: string | null;
    numero: string | null;
    bairro: string | null;
    cidade: string | null;
    estado: string | null;
    telefone: string | null;
  };
  empresa: {
    razaoSocial: string;
    nomeFantasia: string | null;
    cnpj: string | null;
    logradouro: string | null;
    numero: string | null;
    bairro: string | null;
    cidade: string | null;
    estado: string | null;
    telefone: string | null;
  } | null;
  itens: Array<{
    codigo: string;
    descricao: string;
    un: string;
    quantidade: number;
    precoUnitario: number;
    valorDesconto: number;
    valorTotal: number;
  }>;
};

// ── helpers ──────────────────────────────────────────────────────────────────
const brl = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtde = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

// ── Envio do orçamento por WhatsApp ──────────────────────────────────────────
// Telefone só com dígitos + DDI Brasil (55) quando ausente.
export function telWhatsApp(tel: string | null): string {
  const d = (tel ?? "").replace(/\D/g, "");
  if (!d) return "";
  return d.length <= 11 ? `55${d}` : d;
}

/** Texto do orçamento/pedido para WhatsApp (negrito *…* do app). */
export function buildPedidoWhatsAppText(p: PedidoPrintData): string {
  const empresa = p.empresa ? (p.empresa.nomeFantasia || p.empresa.razaoSocial) : "";
  const titulo = p.status === "ORCAMENTO" ? "ORÇAMENTO" : "PEDIDO";
  const linhas = p.itens.map((it) =>
    `• ${it.descricao} — ${qtde(it.quantidade)} ${it.un} x R$ ${brl(it.precoUnitario)} = R$ ${brl(it.valorTotal)}`,
  ).join("\n");
  return [
    `*${titulo} ${p.numero}*`,
    empresa,
    "",
    `Olá! Segue o ${titulo.toLowerCase()}:`,
    linhas,
    "",
    p.valorDesconto > 0 ? `Desconto: R$ ${brl(p.valorDesconto)}` : "",
    p.valorFrete > 0 ? `Frete: R$ ${brl(p.valorFrete)}` : "",
    `*Total: R$ ${brl(p.valorTotal)}*`,
    p.formaPagamento ? `Pagamento: ${p.formaPagamento}` : "",
    p.condicaoPagamento ? `Condição: ${p.condicaoPagamento}` : "",
    "",
    "Qualquer dúvida, estou à disposição!",
  ].filter((l) => l !== "").join("\n");
}

/** Abre o WhatsApp (app/web) com o orçamento pronto para o telefone do cliente. */
export function enviarPedidoWhatsApp(p: PedidoPrintData): void {
  const tel = telWhatsApp(p.cliente.telefone);
  const texto = encodeURIComponent(buildPedidoWhatsAppText(p));
  const url = tel ? `https://wa.me/${tel}?text=${texto}` : `https://wa.me/?text=${texto}`;
  window.open(url, "_blank");
}

function fmtData(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "-" : d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "");
}

function tituloDocumento(p: PedidoPrintData): string {
  return p.status === "ORCAMENTO"
    ? "DOCUMENTO AUXILIAR DE VENDA - ORÇAMENTO"
    : "DOCUMENTO AUXILIAR DE VENDA - PEDIDO";
}

function enderecoLinha(e: { logradouro: string | null; numero: string | null; bairro: string | null; cidade: string | null; estado: string | null }): string {
  const partes = [
    [e.logradouro, e.numero].filter(Boolean).join(", "),
    e.bairro,
    [e.cidade, e.estado].filter(Boolean).join(", "),
  ].filter(Boolean);
  return partes.join(" — ");
}

// ── ESC/POS (bobina 80mm) ────────────────────────────────────────────────────
const ESC = 0x1b, GS = 0x1d;

export function buildPedidoEscPos(p: PedidoPrintData, cols = 48): Uint8Array {
  const bytes: number[] = [];
  const enc = new TextEncoder();
  const raw = (arr: number[]) => bytes.push(...arr);
  const line = (s = "") => { const e = enc.encode(stripAccents(s)); for (let i = 0; i < e.length; i++) bytes.push(e[i]); bytes.push(0x0a); };
  const sep = (ch = "-") => line(ch.repeat(cols));
  const lr = (l: string, r: string) => {
    const a = stripAccents(l), b = stripAccents(r);
    line(a + " ".repeat(Math.max(1, cols - a.length - b.length)) + b);
  };

  raw([ESC, 0x40]); // init
  raw([ESC, 0x61, 0x01]); // center
  if (p.empresa) {
    raw([ESC, 0x45, 0x01]);
    line(p.empresa.nomeFantasia || p.empresa.razaoSocial);
    raw([ESC, 0x45, 0x00]);
    if (p.empresa.cnpj) line(`CNPJ: ${p.empresa.cnpj}`);
    const end = enderecoLinha(p.empresa);
    if (end) line(end);
    if (p.empresa.telefone) line(`Fone: ${p.empresa.telefone}`);
  }
  sep("=");
  line("DOCUMENTO AUXILIAR DE VENDA");
  line(p.status === "ORCAMENTO" ? "ORCAMENTO" : "PEDIDO");
  line("NAO E DOCUMENTO FISCAL");
  sep("=");
  raw([ESC, 0x45, 0x01]); raw([GS, 0x21, 0x01]);
  line(`PEDIDO ${p.numero}`);
  raw([GS, 0x21, 0x00]); raw([ESC, 0x45, 0x00]);
  raw([ESC, 0x61, 0x00]); // left

  lr("Emissao:", fmtData(p.dataEmissao));
  if (p.formaPagamento) lr("Pagamento:", p.formaPagamento);
  if (p.condicaoPagamento) lr("Condicao:", p.condicaoPagamento);
  sep();
  raw([ESC, 0x45, 0x01]); line("CLIENTE"); raw([ESC, 0x45, 0x00]);
  line(p.cliente.nomeFantasia || p.cliente.razaoSocial);
  if (p.cliente.cpfCnpj) line(`CPF/CNPJ: ${p.cliente.cpfCnpj}`);
  sep();

  raw([ESC, 0x45, 0x01]); line("ITENS"); raw([ESC, 0x45, 0x00]);
  for (const it of p.itens) {
    line(it.descricao);
    lr(`  ${it.codigo}  ${qtde(it.quantidade)} ${it.un} x ${brl(it.precoUnitario)}`, brl(it.valorTotal));
  }
  sep();

  lr("Itens R$:", brl(p.valorProdutos));
  if (p.valorDesconto > 0) lr("Desconto R$:", `-${brl(p.valorDesconto)}`);
  if (p.valorFrete > 0) lr("Frete R$:", brl(p.valorFrete));
  raw([ESC, 0x45, 0x01]);
  lr("TOTAL R$:", brl(p.valorTotal));
  raw([ESC, 0x45, 0x00]);
  if (p.observacoes) { sep(); line("Obs:"); line(p.observacoes); }

  raw([ESC, 0x64, 2]);
  line("Assinatura:");
  line("_".repeat(Math.min(38, cols)));
  raw([ESC, 0x64, 3]);
  raw([GS, 0x56, 0x42, 0x00]); // corte

  return new Uint8Array(bytes);
}

// ── janela de impressão (compartilhado) ──────────────────────────────────────
function abrirJanela(html: string): void {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) throw new Error("O navegador bloqueou a janela de impressão — permita pop-ups para este site.");
  win.document.write(html);
  win.document.close();
  win.focus();
  // dá tempo do conteúdo renderizar antes do diálogo
  setTimeout(() => { win.print(); }, 250);
}

// ── Bobina 80mm pelo diálogo do navegador (fallback do WebUSB) ───────────────
export function printPedidoTermicaDialog(p: PedidoPrintData): void {
  const lr = (l: string, r: string, bold = false) =>
    `<div class="lr${bold ? " bold" : ""}"><span>${esc(l)}</span><span>${esc(r)}</span></div>`;

  const itens = p.itens.map((it) =>
    `<div class="item">${esc(it.descricao)}</div>` +
    lr(`  ${it.codigo}  ${qtde(it.quantidade)} ${it.un} x ${brl(it.precoUnitario)}`, brl(it.valorTotal))
  ).join("");

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Pedido ${esc(p.numero)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 72mm; margin: 0 auto; padding: 2mm 0 6mm; font-family: "Courier New", ui-monospace, monospace; font-size: 10.5pt; line-height: 1.35; color: #000; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .sep { border-top: 1px dashed #000; margin: 1.5mm 0; }
  .lr { display: flex; justify-content: space-between; gap: 2mm; }
  .item { margin-top: 1mm; }
</style></head><body>
  ${p.empresa ? `<div class="center bold">${esc(p.empresa.nomeFantasia || p.empresa.razaoSocial)}</div>
  ${p.empresa.cnpj ? `<div class="center">CNPJ: ${esc(p.empresa.cnpj)}</div>` : ""}` : ""}
  <div class="sep"></div>
  <div class="center">DOCUMENTO AUXILIAR DE VENDA — ${p.status === "ORCAMENTO" ? "ORÇAMENTO" : "PEDIDO"}</div>
  <div class="center">NÃO É DOCUMENTO FISCAL</div>
  <div class="sep"></div>
  <div class="center bold" style="font-size:13pt">PEDIDO ${esc(p.numero)}</div>
  ${lr("Emissão:", fmtData(p.dataEmissao))}
  ${p.formaPagamento ? lr("Pagamento:", p.formaPagamento) : ""}
  ${p.condicaoPagamento ? lr("Condição:", p.condicaoPagamento) : ""}
  <div class="sep"></div>
  <div class="bold">CLIENTE</div>
  <div>${esc(p.cliente.nomeFantasia || p.cliente.razaoSocial)}</div>
  ${p.cliente.cpfCnpj ? `<div>CPF/CNPJ: ${esc(p.cliente.cpfCnpj)}</div>` : ""}
  <div class="sep"></div>
  <div class="bold">ITENS</div>
  ${itens}
  <div class="sep"></div>
  ${lr("Itens R$:", brl(p.valorProdutos))}
  ${p.valorDesconto > 0 ? lr("Desconto R$:", `-${brl(p.valorDesconto)}`) : ""}
  ${p.valorFrete > 0 ? lr("Frete R$:", brl(p.valorFrete)) : ""}
  ${lr("TOTAL R$:", brl(p.valorTotal), true)}
  ${p.observacoes ? `<div class="sep"></div><div>Obs: ${esc(p.observacoes)}</div>` : ""}
  <div style="margin-top:10mm">Assinatura:</div>
  <div>______________________________</div>
</body></html>`;
  abrirJanela(html);
}

// ── Folha A4 — DAV no modelo fornecido ───────────────────────────────────────
export function printPedidoA4(p: PedidoPrintData): void {
  const linhas = p.itens.map((it) => `
    <tr>
      <td class="c">${esc(it.codigo)}</td>
      <td>${esc(it.descricao)}</td>
      <td class="c">${esc(it.un)}</td>
      <td class="r">${qtde(it.quantidade)}</td>
      <td class="r">${brl(it.precoUnitario)}</td>
      <td class="r">${brl(it.quantidade * it.precoUnitario)}</td>
      <td class="r">${brl(it.valorDesconto)}</td>
      <td class="r bold">${brl(it.valorTotal)}</td>
    </tr>`).join("");

  const empresaNome = p.empresa ? (p.empresa.nomeFantasia || p.empresa.razaoSocial) : "";
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(p.numero)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; color: #000; }
  .moldura { border: 1.5px solid #000; }
  .titulo { text-align: center; font-weight: bold; font-size: 11pt; padding: 2mm; border-bottom: 1px solid #000; }
  .aviso { text-align: center; font-weight: bold; font-size: 9pt; padding: 1.5mm 2mm; border-bottom: 1px solid #000; }
  .empresa { text-align: center; padding: 2mm; border-bottom: 1px solid #000; line-height: 1.5; }
  .empresa .nome { font-weight: bold; }
  .meta { padding: 1.5mm 2mm; border-bottom: 1px solid #000; }
  .meta .cliente { font-weight: bold; }
  .docnum { display: flex; border-bottom: 1px solid #000; }
  .docnum div { flex: 1; padding: 1.5mm 2mm; }
  .docnum div + div { border-left: 1px solid #000; }
  table { width: 100%; border-collapse: collapse; }
  th { border-bottom: 1.5px solid #000; border-right: 1px solid #ccc; padding: 1.5mm 1mm; font-size: 8.5pt; background: #f2f2f2; }
  td { border-bottom: 1px solid #ddd; border-right: 1px solid #eee; padding: 1.5mm 1mm; vertical-align: top; }
  .c { text-align: center; } .r { text-align: right; white-space: nowrap; } .bold { font-weight: bold; }
  .rodape { display: flex; justify-content: space-between; margin-top: 4mm; }
  .totais { text-align: right; line-height: 1.7; }
  .totais .total { font-weight: bold; font-size: 11pt; }
  .assinaturas { display: flex; gap: 18mm; margin-top: 22mm; }
  .assinaturas div { flex: 1; border-top: 1px solid #000; text-align: center; font-size: 8pt; padding-top: 1mm; }
  .vedada { text-align: center; margin-top: 10mm; font-size: 9pt; }
</style></head><body>
  <div class="moldura">
    <div class="titulo">${esc(tituloDocumento(p))}</div>
    <div class="aviso">NÃO É DOCUMENTO FISCAL — NÃO É VÁLIDO COMO RECIBO E COMO GARANTIA<br>DE MERCADORIA - NÃO COMPROVA PAGAMENTO</div>
    ${p.empresa ? `<div class="empresa">
      <div class="nome">${esc(p.empresa.razaoSocial)}${p.empresa.cnpj ? ` — CPF/CNPJ: ${esc(p.empresa.cnpj)}` : ""}</div>
      <div>${esc(enderecoLinha(p.empresa))}</div>
      ${p.empresa.telefone ? `<div>FONE: ${esc(p.empresa.telefone)}</div>` : ""}
    </div>` : ""}
    <div class="meta">
      <div>Data: ${fmtData(p.dataEmissao)}${p.formaPagamento ? ` &nbsp;&nbsp;Pagamento: ${esc(p.formaPagamento)}` : ""}${p.condicaoPagamento ? ` &nbsp;&nbsp;Condição: ${esc(p.condicaoPagamento)}` : ""}</div>
      <div class="cliente">Cliente: ${esc(p.cliente.razaoSocial)}${p.cliente.nomeFantasia ? ` (${esc(p.cliente.nomeFantasia)})` : ""}${p.cliente.cpfCnpj ? ` — ${esc(p.cliente.cpfCnpj)}` : ""}</div>
      <div>Endereço: ${esc(enderecoLinha(p.cliente)) || "—"}</div>
    </div>
    <div class="docnum">
      <div>Nº do Documento: <b>${esc(p.numero)}</b></div>
      <div>Nº do Documento Fiscal: ______________</div>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width:14mm">Código</th>
          <th>Descrição</th>
          <th style="width:10mm">UN</th>
          <th style="width:14mm">Quant.</th>
          <th style="width:20mm">Preço Unit.</th>
          <th style="width:20mm">Preço</th>
          <th style="width:14mm">Desc.</th>
          <th style="width:22mm">TOTAL R$</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>
  </div>

  <div class="rodape">
    <div>${p.observacoes ? `Obs: ${esc(p.observacoes)}` : ""}</div>
    <div class="totais">
      <div>Itens R$: ${brl(p.valorProdutos)}</div>
      ${p.valorDesconto > 0 ? `<div>Desconto global R$: ${brl(p.valorDesconto)}</div>` : ""}
      ${p.valorFrete > 0 ? `<div>Frete R$: ${brl(p.valorFrete)}</div>` : ""}
      <div class="total">TOTAL R$: ${brl(p.valorTotal)}</div>
    </div>
  </div>

  <div class="assinaturas">
    <div>${esc(empresaNome)}</div>
    <div>${esc(p.cliente.nomeFantasia || p.cliente.razaoSocial)}</div>
  </div>
  <div class="vedada">É vedada a autenticação deste documento</div>
</body></html>`;
  abrirJanela(html);
}
