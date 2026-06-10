// Imprime a minuta pelo DIÁLOGO do navegador (window.print), formatada para
// bobina térmica de 80mm. É o caminho para máquinas onde a impressora está com
// o driver do fabricante (ex.: "EPSON USB Controller" no Windows) — nesse caso
// o WebUSB não enxerga o aparelho, mas o driver imprime normalmente, inclusive
// com corte automático (configurável nas preferências do driver da Epson).
//
// Mesmo conteúdo/ordem do cupom ESC/POS (ver escpos-minuta.ts).

import type { MinutaPrint } from "@/lib/escpos-minuta";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function fmtQty(n: string | number | null | undefined): string {
  const v = parseFloat(String(n ?? 0));
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function buildHtml(minuta: MinutaPrint, empresa?: string): string {
  const lr = (label: string, value: string) =>
    `<div class="lr"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;

  const itens = minuta.itens
    .map((it) => {
      const un = it.unidade?.sigla ?? "UN";
      const qtd = it.quantidadeConvertida != null ? it.quantidadeConvertida : it.quantidade;
      return (
        `<div class="item">${esc(it.item.descricao)}</div>` +
        lr(`  ${it.item.codigo}`, `${fmtQty(qtd)} ${un}`)
      );
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Minuta ${esc(minuta.numero)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 72mm;               /* área útil típica da bobina de 80mm */
    margin: 0 auto;
    padding: 2mm 0 6mm;
    font-family: "Courier New", ui-monospace, monospace;
    font-size: 10.5pt;
    line-height: 1.35;
    color: #000;
  }
  .center { text-align: center; }
  .bold   { font-weight: bold; }
  .titulo { font-size: 14pt; font-weight: bold; }
  .sep    { border-top: 1px dashed #000; margin: 1.5mm 0; }
  .lr     { display: flex; justify-content: space-between; gap: 2mm; }
  .lr span:first-child { white-space: pre; }
  .item   { word-break: break-word; }
  .obs    { white-space: pre-wrap; word-break: break-word; }
  .assin  { margin-top: 9mm; border-top: 1px solid #000; }
</style>
</head>
<body>
  ${empresa ? `<div class="center bold">${esc(empresa)}</div>` : ""}
  <div class="center titulo">MINUTA ${esc(minuta.numero)}</div>
  ${minuta.tipo ? `<div class="center">${minuta.tipo === "RETIRADA" ? "Retirada" : "Entrega"}</div>` : ""}
  <div class="sep"></div>
  ${minuta.numeroFisico ? lr("Minuta física:", minuta.numeroFisico) : ""}
  ${lr("Pedido:", minuta.pedidoVenda.numero)}
  ${lr("Emissão:", fmtDate(minuta.dataEmissao))}
  ${lr(minuta.tipo === "RETIRADA" ? "Retirada:" : "Entrega:", fmtDate(minuta.dataEntrega))}
  <div class="sep"></div>
  <div class="bold">CLIENTE</div>
  <div>${esc(minuta.pedidoVenda.cliente.nomeFantasia || minuta.pedidoVenda.cliente.razaoSocial)}</div>
  <div class="sep"></div>
  <div class="bold">ITENS</div>
  ${itens}
  <div class="sep"></div>
  ${minuta.motorista?.nome ? lr("Motorista:", minuta.motorista.nome) : ""}
  ${minuta.placa ? lr("Placa:", minuta.placa) : ""}
  ${minuta.observacoes ? `<div>Obs:</div><div class="obs">${esc(minuta.observacoes)}</div>` : ""}
  <div>Recebido por:</div>
  <div class="assin">&nbsp;</div>
</body>
</html>`;
}

/**
 * Abre o diálogo de impressão do navegador com a minuta formatada para 80mm.
 * Usa um iframe oculto — a página atual não muda nem recarrega.
 */
export function printMinutaViaDialog(minuta: MinutaPrint, empresa?: string): void {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    throw new Error("Não foi possível preparar a impressão.");
  }
  doc.open();
  doc.write(buildHtml(minuta, empresa));
  doc.close();

  const win = iframe.contentWindow!;
  const cleanup = () => setTimeout(() => iframe.remove(), 500);
  win.addEventListener("afterprint", cleanup);
  // fallback: alguns navegadores não disparam afterprint em iframe
  setTimeout(cleanup, 60_000);

  // Espera o layout do iframe assentar antes de abrir o diálogo
  setTimeout(() => {
    win.focus();
    win.print();
  }, 150);
}
