// Planilha "Exames a realizar" (ASO e exames). Duas abas:
//  1. Exames a realizar — uma linha por colaborador × exame: o ASO, os exames
//     que a função exige (em dia, vencendo, vencido, nunca feito) e, em outra
//     cor, os exames feitos que a função NÃO exige.
//  2. Exames por função — exames exigidos, preço e custo previsto por função.
// Usa xlsx-js-style (SheetJS com estilos) só aqui, carregado sob demanda.
import { fmtData } from "@/components/sst/comum";

export type ColabPlanilha = {
  id: string; nome: string; setor: string | null;
  funcao: { id: string; nome: string } | null;
  exigidos: { exameTipoId: string; nome: string; periodicidadeMeses: number }[];
  exames: { exameTipoId: string; data: string }[];
  ultimoAso: { tipo: string; data: string; validade: string | null; resultado: string } | null;
};
export type TipoPlanilha = { id: string; nome: string; periodicidadeMeses: number | null; preco: string | null; clinico: boolean };
type FuncaoPlanilha = { id: string; nome: string; ghe: string | null; ativo: boolean; requisitosExame: { periodicidadeMeses: number; exameTipo: { id: string; nome: string } }[] };

const TIPO_ASO: Record<string, string> = { ADMISSIONAL: "Admissional", PERIODICO: "Periódico", RETORNO: "Retorno ao trabalho", MUDANCA_FUNCAO: "Mudança de função", DEMISSIONAL: "Demissional" };
const DIA_MS = 86_400_000;
const somaMeses = (d: Date, m: number) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };

// Situação → ordem na lista e cor da fonte.
type Situacao = { texto: string; ordem: number; cor: string; aRealizar: boolean };
function situacao(proximo: Date | null, feito: boolean, janelaDias: number): Situacao {
  if (!feito) return { texto: "Nunca realizado", ordem: 0, cor: "FFC00000", aRealizar: true };
  if (!proximo) return { texto: "Sem vencimento", ordem: 3, cor: "FF595959", aRealizar: false };
  const dias = Math.ceil((proximo.getTime() - Date.now()) / DIA_MS);
  if (dias < 0) return { texto: `Vencido há ${-dias} dia(s)`, ordem: 1, cor: "FFC00000", aRealizar: true };
  if (dias <= janelaDias) return { texto: `Vence em ${dias} dia(s)`, ordem: 2, cor: "FFB45F06", aRealizar: true };
  return { texto: "Em dia", ordem: 3, cor: "FF38761D", aRealizar: false };
}

type Linha = {
  colab: ColabPlanilha; exame: string; exigido: boolean; periodicidade: number | null;
  ultimo: Date | null; proximo: Date | null; sit: Situacao; preco: number; detalhe?: string;
};

export async function exportarPlanilhaExames(colabs: ColabPlanilha[], tipos: TipoPlanilha[], janelaDias: number) {
  // CJS: conforme o bundler, o módulo vem em .default.
  const mod = await import("xlsx-js-style");
  const XLSX = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod;
  const funcoes: FuncaoPlanilha[] = (await fetch("/api/sst/funcoes").then((r) => r.json())).data ?? [];
  const tipo = new Map(tipos.map((t) => [t.id, t]));
  const preco = (id: string) => Number(tipo.get(id)?.preco ?? 0);
  const clinico = tipos.find((t) => t.clinico);
  const precoClinico = Number(clinico?.preco ?? 0);

  // ── Aba 1: exames a realizar ──────────────────────────────────────────────
  const linhas: Linha[] = [];
  for (const c of [...colabs].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))) {
    const ultimoPorTipo = new Map<string, Date>();
    for (const e of c.exames) {
      const d = new Date(e.data);
      if (!ultimoPorTipo.has(e.exameTipoId) || ultimoPorTipo.get(e.exameTipoId)!.getTime() < d.getTime()) ultimoPorTipo.set(e.exameTipoId, d);
    }
    // ASO primeiro: a validade dele é a data-alvo dos exames da função.
    const a = c.ultimoAso;
    const asoValidade = a?.validade ? new Date(a.validade) : null;
    linhas.push({
      colab: c, exame: "ASO (exame clínico)", exigido: true, periodicidade: null,
      ultimo: a ? new Date(a.data) : null, proximo: asoValidade, sit: situacao(asoValidade, !!a, janelaDias), preco: precoClinico,
      detalhe: a ? `${TIPO_ASO[a.tipo] ?? a.tipo}${a.resultado === "INAPTO" ? " — INAPTO" : ""}` : undefined,
    });
    const exigidos = c.exigidos.map((r): Linha => {
      const ult = ultimoPorTipo.get(r.exameTipoId) ?? null;
      const prox = ult ? somaMeses(ult, r.periodicidadeMeses) : null;
      return { colab: c, exame: r.nome, exigido: true, periodicidade: r.periodicidadeMeses, ultimo: ult, proximo: prox, sit: situacao(prox, !!ult, janelaDias), preco: preco(r.exameTipoId) };
    }).sort((x, y) => x.sit.ordem - y.sit.ordem || x.exame.localeCompare(y.exame, "pt-BR"));
    linhas.push(...exigidos);
    // Feitos sem exigência da função: informativos (não entram no custo a realizar).
    const exigidoIds = new Set(c.exigidos.map((r) => r.exameTipoId));
    for (const [id, ult] of Array.from(ultimoPorTipo)) {
      if (exigidoIds.has(id)) continue;
      const t = tipo.get(id);
      const per = t?.periodicidadeMeses ?? null;
      linhas.push({
        colab: c, exame: t?.nome ?? "Exame", exigido: false, periodicidade: per, ultimo: ult, proximo: per ? somaMeses(ult, per) : null,
        sit: { texto: "Feito sem exigência da função", ordem: 9, cor: "FF2F5597", aRealizar: false }, preco: preco(id),
      });
    }
  }

  const cab1 = ["Colaborador", "Setor", "Função", "Exame", "Exigido pela função", "Periodicidade (meses)", "Último", "Próximo / vence", "Situação", "ASO / observação", "Preço (R$)", "Custo a realizar (R$)"];
  const aoa1: (string | number)[][] = [cab1, ...linhas.map((l) => [
    l.colab.nome, l.colab.setor ?? "", l.colab.funcao?.nome ?? "Sem função", l.exame, l.exigido ? "Sim" : "Não",
    l.periodicidade ?? "", l.ultimo ? fmtData(l.ultimo) : "", l.proximo ? fmtData(l.proximo) : "",
    l.sit.texto, l.detalhe ?? "", l.preco || "", l.exigido && l.sit.aRealizar ? l.preco : "",
  ])];
  const totalRealizar = linhas.reduce((s, l) => s + (l.exigido && l.sit.aRealizar ? l.preco : 0), 0);
  aoa1.push([], ["Total a realizar (vencidos, nunca realizados e vencendo em até " + janelaDias + " dias)", "", "", "", "", "", "", "", "", "", "", totalRealizar]);
  const ws1 = XLSX.utils.aoa_to_sheet(aoa1);

  const borda = { bottom: { style: "thin", color: { rgb: "FFD9D9D9" } } };
  const estiloCab = { font: { bold: true, color: { rgb: "FFFFFFFF" } }, fill: { fgColor: { rgb: "FF305496" } }, alignment: { vertical: "center", wrapText: true } };
  const moeda = "#,##0.00";
  cab1.forEach((_, ci) => { ws1[XLSX.utils.encode_cell({ r: 0, c: ci })].s = estiloCab; });
  linhas.forEach((l, i) => {
    const r = i + 1;
    // Exame não exigido pela função: linha em azul.
    const fill = !l.exigido ? { fgColor: { rgb: "FFDDEBF7" } } : undefined;
    for (let ci = 0; ci < cab1.length; ci++) {
      const cell = ws1[XLSX.utils.encode_cell({ r, c: ci })];
      if (!cell) continue;
      cell.s = {
        border: borda,
        ...(fill ? { fill } : {}),
        font: {
          ...(!l.exigido ? { italic: true, color: { rgb: "FF2F5597" } } : {}),
          ...(ci === 8 ? { bold: l.sit.aRealizar, color: { rgb: l.sit.cor } } : {}),
          ...(l.exame.startsWith("ASO") && ci === 3 ? { bold: true } : {}),
        },
        ...(ci >= 10 ? { numFmt: moeda } : {}),
      };
    }
  });
  const rTotal = aoa1.length - 1;
  for (let ci = 0; ci < cab1.length; ci++) {
    const cell = ws1[XLSX.utils.encode_cell({ r: rTotal, c: ci })];
    if (cell) cell.s = { font: { bold: true }, fill: { fgColor: { rgb: "FFF2F2F2" } }, ...(ci >= 10 ? { numFmt: moeda } : {}) };
  }
  ws1["!cols"] = [34, 18, 40, 38, 11, 11, 11, 13, 26, 24, 11, 13].map((wch) => ({ wch }));
  ws1["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: linhas.length, c: cab1.length - 1 } }) };
  ws1["!rows"] = [{ hpt: 30 }];
  // Legenda à direita do cabeçalho.
  XLSX.utils.sheet_add_aoa(ws1, [["Legenda"], ["Linha azul: exame feito que a função não exige"], ["Vermelho: vencido / nunca realizado"], ["Laranja: vence dentro da janela"], ["Verde: em dia"]], { origin: { r: 0, c: cab1.length + 1 } });
  const leg = [{ bold: true }, { italic: true, color: { rgb: "FF2F5597" } }, { color: { rgb: "FFC00000" } }, { color: { rgb: "FFB45F06" } }, { color: { rgb: "FF38761D" } }];
  leg.forEach((font, r) => { const cell = ws1[XLSX.utils.encode_cell({ r, c: cab1.length + 1 })]; cell.s = { font, ...(r === 1 ? { fill: { fgColor: { rgb: "FFDDEBF7" } } } : {}) }; });
  (ws1["!cols"] as { wch: number }[]).push({ wch: 3 }, { wch: 46 });

  // ── Aba 2: exames por função e custo previsto ─────────────────────────────
  // Colaboradores considerados = os da agenda (ativos, não afastados).
  const nPorFuncao = new Map<string, number>();
  for (const c of colabs) if (c.funcao) nPorFuncao.set(c.funcao.id, (nPorFuncao.get(c.funcao.id) ?? 0) + 1);
  const cab2 = ["GHE", "Função", "Exame", "Periodicidade (meses)", "Preço (R$)", "Custo anual por colaborador (R$)", "Colaboradores", "Custo por ASO completo × colaboradores (R$)", "Custo anual previsto (R$)"];
  const aoa2: (string | number)[][] = [cab2];
  const estilos2: ("item" | "total")[] = [];
  let geralAso = 0, geralAnual = 0;
  const lista = funcoes.filter((f) => f.ativo || nPorFuncao.has(f.id))
    .sort((x, y) => (x.ghe ?? "~").localeCompare(y.ghe ?? "~", "pt-BR", { numeric: true }) || x.nome.localeCompare(y.nome, "pt-BR"));
  for (const f of lista) {
    const n = nPorFuncao.get(f.id) ?? 0;
    // ASO periódico vale pela menor periodicidade exigida (mesma regra do lançamento do ASO), 12 m sem exames.
    const perAso = f.requisitosExame.length ? Math.min(...f.requisitosExame.map((r) => r.periodicidadeMeses)) : 12;
    const itens = [
      { nome: "ASO (exame clínico)", per: perAso, preco: precoClinico },
      ...f.requisitosExame.map((r) => ({ nome: r.exameTipo.nome, per: r.periodicidadeMeses, preco: preco(r.exameTipo.id) })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    ];
    for (const it of itens) {
      aoa2.push([f.ghe ?? "", f.nome, it.nome, it.per, it.preco || "", it.preco ? (it.preco * 12) / it.per : "", "", "", ""]);
      estilos2.push("item");
    }
    const custoAso = itens.reduce((s, it) => s + it.preco, 0);
    const anualColab = itens.reduce((s, it) => s + (it.preco * 12) / it.per, 0);
    geralAso += custoAso * n; geralAnual += anualColab * n;
    aoa2.push([f.ghe ?? "", `Total — ${f.nome}`, "", "", custoAso, anualColab, n, custoAso * n, anualColab * n]);
    estilos2.push("total");
  }
  aoa2.push(["", "TOTAL GERAL", "", "", "", "", Array.from(nPorFuncao.values()).reduce((s, x) => s + x, 0), geralAso, geralAnual]);
  estilos2.push("total");
  const ws2 = XLSX.utils.aoa_to_sheet(aoa2);
  cab2.forEach((_, ci) => { ws2[XLSX.utils.encode_cell({ r: 0, c: ci })].s = estiloCab; });
  estilos2.forEach((e, i) => {
    const geral = i === estilos2.length - 1;
    for (let ci = 0; ci < cab2.length; ci++) {
      const cell = ws2[XLSX.utils.encode_cell({ r: i + 1, c: ci })];
      if (!cell) continue;
      cell.s = {
        border: borda,
        ...(e === "total" ? { font: { bold: true }, fill: { fgColor: { rgb: geral ? "BDD7EE" : "F2F2F2" } } } : {}),
        ...(ci >= 4 && ci !== 6 ? { numFmt: moeda } : {}),
      };
    }
  });
  ws2["!cols"] = [26, 44, 38, 11, 11, 14, 13, 18, 16].map((wch) => ({ wch }));
  ws2["!rows"] = [{ hpt: 42 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, "Exames a realizar");
  XLSX.utils.book_append_sheet(wb, ws2, "Exames por função");
  XLSX.writeFile(wb, `exames-a-realizar-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
