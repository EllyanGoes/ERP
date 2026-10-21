// Guia de encaminhamento à clínica (impressão na mesma aba, via iframe oculto):
// 1ª página = lista do lote (quem vai, quando, que exames); depois uma guia
// por colaborador para levar à clínica.
import { TIPO_ASO } from "@/components/sst/comum";

export type AgendamentoGuia = {
  id: string; data: string; periodo: string; tipoAso: string; status: string; observacoes: string | null;
  lote: { id: string; numero: number } | null;
  clinica: { nome: string; endereco: string | null; telefone: string | null };
  empresa: { id: string; razaoSocial: string; nomeFantasia: string | null; cnpj: string; logradouro: string | null; numero: string | null; bairro: string | null; cidade: string | null; estado: string | null; telefone: string | null };
  exames: { exameTipoId: string; preco: string | null; exameTipo: { nome: string; clinico: boolean } }[];
  colaborador: {
    id: string; nome: string; cpf: string | null; matricula: string | null; dataAdmissao: string | null; cargo: string | null;
    setor: { nome: string } | null; sstFuncoes: { funcao: { nome: string; ghe: string | null } }[];
  };
};

const LOGOS: Record<string, string> = { emp_tramontin: "/logos/tramontin.png" };
export const PERIODO_LABEL: Record<string, string> = { MANHA: "Manhã", TARDE: "Tarde" };
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const dataBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const diaSemana = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
const cnpj = (v: string) => { const d = v.replace(/\D/g, ""); return d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : v; };
const funcao = (a: AgendamentoGuia) => { const f = a.colaborador.sstFuncoes[0]?.funcao; return f ? f.nome.split(" — ")[0] : a.colaborador.cargo ?? "—"; };
const ghe = (a: AgendamentoGuia) => a.colaborador.sstFuncoes[0]?.funcao.ghe ?? "—";
const exames = (a: AgendamentoGuia) => [...a.exames].sort((x, y) => Number(y.exameTipo.clinico) - Number(x.exameTipo.clinico) || x.exameTipo.nome.localeCompare(y.exameTipo.nome, "pt-BR"));

function cabecalho(a: AgendamentoGuia, titulo: string, sub: string) {
  const e = a.empresa;
  const end = [e.logradouro && `${e.logradouro}${e.numero ? `, ${e.numero}` : ""}`, e.bairro, e.cidade && `${e.cidade}${e.estado ? `/${e.estado}` : ""}`].filter(Boolean).join(" · ");
  const logo = LOGOS[e.id];
  return `<div class="cab">${logo ? `<img src="${logo}" alt="">` : ""}<div><div class="emp">${esc((e.nomeFantasia || e.razaoSocial).toUpperCase())}</div>
  <div class="mini">${esc(e.razaoSocial)} · CNPJ ${esc(cnpj(e.cnpj))}${end ? ` · ${esc(end)}` : ""}${e.telefone ? ` · ${esc(e.telefone)}` : ""}</div></div></div>
  <h1>${esc(titulo)}</h1><div class="sub">${sub}</div>`;
}

export function htmlGuias(ags: AgendamentoGuia[], { lista = true }: { lista?: boolean } = {}) {
  const ord = [...ags].sort((a, b) => a.data.localeCompare(b.data) || a.periodo.localeCompare(b.periodo) || a.colaborador.nome.localeCompare(b.colaborador.nome, "pt-BR"));
  const a0 = ord[0];
  const partes: string[] = [];
  if (lista && a0) {
    const total = ord.reduce((s, a) => s + a.exames.reduce((t, e) => t + Number(e.preco ?? 0), 0), 0);
    const linhas = ord.map((a, i) => `<tr><td>${i + 1}</td><td class="nw">${diaSemana(a.data)} ${dataBR(a.data)}</td><td>${PERIODO_LABEL[a.periodo] ?? a.periodo}</td>
      <td><b>${esc(a.colaborador.nome)}</b><div class="mini">CPF ${esc(a.colaborador.cpf ?? "—")}${a.colaborador.matricula ? ` · mat. ${esc(a.colaborador.matricula)}` : ""}</div></td>
      <td>${esc(funcao(a))}<div class="mini">${esc(ghe(a))}</div></td><td>${esc(TIPO_ASO[a.tipoAso] ?? a.tipoAso)}</td>
      <td>${exames(a).map((e) => esc(e.exameTipo.nome)).join("<br>")}</td></tr>`).join("");
    partes.push(`<section>${cabecalho(a0, `Agendamento de exames ocupacionais${a0.lote ? ` — lote nº ${String(a0.lote.numero).padStart(4, "0")}` : ""}`,
      `Clínica: <b>${esc(a0.clinica.nome)}</b>${a0.clinica.endereco ? ` · ${esc(a0.clinica.endereco)}` : ""}${a0.clinica.telefone ? ` · ${esc(a0.clinica.telefone)}` : ""} · ${ord.length} colaborador(es)`)}
      <table><thead><tr><th>#</th><th>Data</th><th>Período</th><th>Colaborador</th><th>Função / GHE</th><th>ASO</th><th>Exames</th></tr></thead><tbody>${linhas}</tbody></table>
      ${total > 0 ? `<p class="mini" style="margin-top:6px">Custo previsto pela tabela: ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>` : ""}
      <p class="mini" style="margin-top:14px">Favor confirmar os horários ou informar remarcações. Emitido pelo ERP em ${new Date().toLocaleDateString("pt-BR")}.</p></section>`);
  }
  for (const a of ord) {
    const c = a.colaborador;
    partes.push(`<section class="quebra">${cabecalho(a, "Guia de encaminhamento — exame ocupacional", `Clínica: <b>${esc(a.clinica.nome)}</b>${a.clinica.endereco ? ` · ${esc(a.clinica.endereco)}` : ""}`)}
      <div class="caixa">
        <div><span class="l">Colaborador:</span> <b>${esc(c.nome)}</b></div>
        <div><span class="l">CPF:</span> ${esc(c.cpf ?? "—")} &nbsp; <span class="l">Matrícula:</span> ${esc(c.matricula ?? "—")} &nbsp; <span class="l">Admissão:</span> ${c.dataAdmissao ? dataBR(c.dataAdmissao) : "—"}</div>
        <div><span class="l">Função:</span> ${esc(funcao(a))} &nbsp; <span class="l">GHE:</span> ${esc(ghe(a))}${c.setor ? ` &nbsp; <span class="l">Setor:</span> ${esc(c.setor.nome)}` : ""}</div>
        <div><span class="l">Tipo de ASO:</span> <b>${esc(TIPO_ASO[a.tipoAso] ?? a.tipoAso)}</b> &nbsp; <span class="l">Data:</span> <b>${diaSemana(a.data)} ${dataBR(a.data)} — ${PERIODO_LABEL[a.periodo] ?? a.periodo}</b></div>
      </div>
      <table><thead><tr><th style="width:28px">✓</th><th>Exame solicitado</th></tr></thead><tbody>${exames(a).map((e) => `<tr><td></td><td>${esc(e.exameTipo.nome)}${e.exameTipo.clinico ? " (consulta / ASO)" : ""}</td></tr>`).join("")}</tbody></table>
      ${a.observacoes ? `<p class="mini" style="margin-top:6px"><b>Obs.:</b> ${esc(a.observacoes)}</p>` : ""}
      <div class="ass"><div>Responsável pela empresa</div><div>Carimbo / recebido pela clínica</div></div></section>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><base href="${typeof location !== "undefined" ? location.origin : ""}/"><title>Agendamento de exames</title><style>
  @page { size: A4 portrait; margin: 12mm; } * { box-sizing: border-box; } body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; margin: 0; }
  .quebra { page-break-before: always; } .cab { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #1F3864; padding-bottom: 6px; margin-bottom: 8px; }
  .cab img { width: 130px; height: auto; object-fit: contain; } .emp { font-weight: bold; font-size: 14px; } .mini { font-size: 9.5px; color: #555; }
  h1 { font-size: 15px; margin: 6px 0 2px; color: #1F3864; } .sub { margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; } th, td { border: 1px solid #bbb; padding: 4px 5px; text-align: left; vertical-align: top; } th { background: #D9E2F3; font-size: 10px; }
  .nw { white-space: nowrap; } .caixa { border: 1px solid #bbb; border-radius: 4px; padding: 8px; line-height: 1.7; } .l { color: #555; }
  .ass { display: flex; gap: 40px; margin-top: 50px; } .ass div { flex: 1; border-top: 1px solid #111; padding-top: 4px; text-align: center; font-size: 10px; }
  </style></head><body>${partes.join("")}</body></html>`;
}

/** Imprime um HTML completo num iframe oculto (sem abrir aba nova). */
export function imprimirHtml(html: string, onFim?: () => void) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open(); doc.write(html); doc.close();
  const win = iframe.contentWindow!;
  let feito = false;
  const fim = () => { if (feito) return; feito = true; setTimeout(() => iframe.remove(), 500); onFim?.(); };
  const imgs = Array.from(doc.images).filter((i) => !i.complete);
  Promise.all(imgs.map((i) => new Promise((r) => { i.onload = i.onerror = r; }))).then(() => {
    win.focus();
    win.addEventListener("afterprint", fim, { once: true });
    win.print();
    setTimeout(fim, 60_000);
  });
}
