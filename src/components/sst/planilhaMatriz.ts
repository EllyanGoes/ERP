// Planilhas em MATRIZ (colaborador × item) no formato da "Exames a realizar —
// PCMSO": ✓ verde = feito/entregue (data) · X vermelho = falta · V laranja =
// vencido (refazer/trocar) · + azul = feito sem a função exigir · — cinza = não
// exigido. Três abas: Resumo, a matriz e "Por função". Totais em fórmula (com o
// valor já calculado), preço na linha 3. Dados: /api/sst/relatorios/matriz.
// Usa xlsx-js-style (SheetJS com estilos), carregado sob demanda.

type Estado = "OK" | "VENCIDO" | "FALTA" | "EXTRA" | "NA";
type Coluna = { id: string; nome: string; sub: string | null; preco: number; saldo?: number; emPedido?: number; pedidos?: string[]; base?: boolean };
type LinhaM = {
  nome: string; matricula: string | null; setor: string | null; funcao: string; ghe: string | null;
  info: { ultimaEntrega?: string | null; ultimoAso?: string | null; fazerEm?: string | null; diasAso?: number | null };
  celulas: Record<string, { estado: Estado; data: string | null }>;
};
type FuncaoM = { ghe: string | null; nome: string; n: number; exigidos: Record<string, number> };
export type DadosMatriz = { tipo: "epi" | "exames"; geradoEm: string; colunas: Coluna[]; linhas: LinhaM[]; funcoes: FuncaoM[]; fora: { semFuncao: number; afastados: number } };

type Cel = { v?: string | number; t?: "s" | "n"; f?: string; s?: Record<string, unknown> };
type Ws = Record<string, unknown>;

// Datas do SST são gravadas como dia (meia-noite UTC): formata em UTC, como as telas.
const d2 = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "UTC" }) : "");
const d4 = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "");
const MOEDA = '"R$" #,##0.00';
const AZUL = "FF2F5496", TITULO = "FF1F3864";
const COR: Record<Estado, { font: string; fill: string; bold?: boolean }> = {
  OK: { font: "FF006100", fill: "FFC6EFCE" },
  FALTA: { font: "FF9C0006", fill: "FFF8CBAD", bold: true },
  VENCIDO: { font: "FF9C5700", fill: "FFFFEB9C", bold: true },
  EXTRA: { font: "FF1F4E79", fill: "FFBDD7EE" },
  NA: { font: "FFBFBFBF", fill: "FFF2F2F2" },
};
const borda = { top: { style: "thin", color: { rgb: "FFD9D9D9" } }, bottom: { style: "thin", color: { rgb: "FFD9D9D9" } }, left: { style: "thin", color: { rgb: "FFD9D9D9" } }, right: { style: "thin", color: { rgb: "FFD9D9D9" } } };
const sCab = { font: { bold: true, color: { rgb: "FFFFFFFF" } }, fill: { fgColor: { rgb: AZUL } }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: borda };
const sTitulo = { font: { bold: true, sz: 15, color: { rgb: TITULO } } };
const sNota = { font: { italic: true, sz: 9, color: { rgb: "FF595959" } }, alignment: { wrapText: true, vertical: "top" } };
const sTotal = { font: { bold: true }, fill: { fgColor: { rgb: "FFF2F2F2" } }, border: borda };

export async function exportarPlanilhaMatriz(tipo: "epi" | "exames", empresaNome: string) {
  const mod = await import("xlsx-js-style");
  const XLSX = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod;
  const res = await fetch(`/api/sst/relatorios/matriz?tipo=${tipo}`, { cache: "no-store" });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.data) throw new Error(j.error || "Erro ao gerar o relatório.");
  const D: DadosMatriz = j.data;
  const epi = D.tipo === "epi";
  const hoje = new Date(D.geradoEm).toLocaleDateString("pt-BR");
  const enc = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });
  const col = (c: number) => XLSX.utils.encode_col(c);
  const put = (ws: Ws, r: number, c: number, cel: Cel) => {
    ws[enc(r, c)] = { t: cel.t ?? (typeof cel.v === "number" ? "n" : "s"), v: cel.v ?? (cel.f ? 0 : ""), ...(cel.f ? { f: cel.f } : {}), ...(cel.s ? { s: cel.s } : {}) };
  };
  const ref = (ws: Ws, rows: number, cols: number) => { ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows - 1, c: cols - 1 } }); };

  const nomeAba = epi ? "EPIs a entregar" : "Exames a realizar";
  const q = `'${nomeAba}'`;
  const itemTxt = epi ? "EPI" : "Exame";

  // ── Aba 2: matriz ──────────────────────────────────────────────────────────
  const fixos: { titulo: string; w: number; val: (l: LinhaM) => string; s?: (l: LinhaM) => Record<string, unknown> | undefined }[] = [
    { titulo: "Colaborador", w: 32, val: (l) => l.nome },
    { titulo: "Matrícula", w: 9, val: (l) => l.matricula ?? "—" },
    { titulo: "Setor", w: 16, val: (l) => l.setor ?? "" },
    { titulo: "Função", w: 28, val: (l) => l.funcao },
    ...(epi
      ? [{ titulo: "Última entrega", w: 11, val: (l: LinhaM) => d4(l.info.ultimaEntrega) || "nunca" }]
      : [
          { titulo: "Último ASO", w: 11, val: (l: LinhaM) => d4(l.info.ultimoAso) || "—" },
          {
            titulo: "Fazer em", w: 12,
            val: (l: LinhaM) => (l.info.fazerEm === "JÁ" ? (l.info.ultimoAso ? "JÁ (vencido)" : "JÁ (sem ASO)") : d4(l.info.fazerEm)),
            s: (l: LinhaM) => (l.info.fazerEm === "JÁ" ? { font: { bold: true, color: { rgb: "FF9C0006" } } } : l.info.diasAso != null && l.info.diasAso <= 30 ? { font: { bold: true, color: { rgb: "FF9C5700" } } } : undefined),
          },
        ]),
  ];
  const nF = fixos.length;
  const cols = D.colunas;
  const c0 = nF;                       // 1ª coluna de item
  const cN = c0 + cols.length - 1;     // última coluna de item
  const cFalt = cN + 1, cCusto = cN + 2;
  const baseIdx = cols.findIndex((c) => c.base); // exames: exame clínico (cobrado se faltar qualquer coisa)
  const R0 = 4;                        // 1ª linha de dados (0-based → linha 5)

  // Ordem: exames pelo "fazer em" (já primeiro); EPI pelo nome.
  const linhas = [...D.linhas].sort((a, b) => {
    if (!epi) {
      const ka = a.info.fazerEm === "JÁ" ? "0" : a.info.fazerEm ?? "9", kb = b.info.fazerEm === "JÁ" ? "0" : b.info.fazerEm ?? "9";
      if (ka !== kb) return ka < kb ? -1 : 1;
    }
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
  const nL = linhas.length;
  const rUlt = R0 + nL - 1;
  const ws: Ws = {};
  put(ws, 0, 0, { v: `${epi ? "EPIs a entregar" : "Exames a realizar"} — ${empresaNome} (situação em ${hoje})`, s: sTitulo });
  put(ws, 1, 0, {
    v: epi
      ? "Verde ✓ = entregue e em uso (data da entrega) · Vermelho X = falta entregar · Laranja V = troca vencida (data da troca prevista) · Azul + = entregue, mas a função NÃO exige (não entra em 'Faltam' nem no custo) · Cinza — = a função não exige. Custo = EPIs que faltam ou a trocar × custo médio do estoque (linha 3)."
      : "Verde ✓ = feito e válido (data do último) · Vermelho X = nunca feito · Laranja V = vencido, refazer (data do último) · Azul + = feito, mas a função NÃO exige (não entra em 'Faltam' nem no custo) · Cinza — = a função não exige. Custo = exames que faltam + exame clínico do periódico. Preço na linha 3.",
    s: sNota,
  });
  const chips: [Estado, string][] = epi
    ? [["OK", "✓ entregue"], ["FALTA", "X falta"], ["VENCIDO", "V trocar"], ["EXTRA", "+ s/ exigência"], ["NA", "— não exigido"]]
    : [["OK", "✓ feito"], ["FALTA", "X falta"], ["VENCIDO", "V vencido"], ["EXTRA", "+ feito, não exigido"], ["NA", "— não exigido"]];
  // Legenda na linha 3: um chip por coluna fixa (EPI tem uma coluna a menos — o "—" vai junto do "+").
  if (chips.length > nF - 1) { const [, t1] = chips[chips.length - 2], [, t2] = chips[chips.length - 1]; chips.splice(chips.length - 2, 2, ["EXTRA", `${t1} · ${t2}`]); }
  chips.forEach(([e, t], i) => { if (i < nF - 1) put(ws, 2, i, { v: t, s: { font: { bold: true, color: { rgb: COR[e].font } }, fill: { fgColor: { rgb: COR[e].fill } }, alignment: { horizontal: "center" }, border: borda } }); });
  put(ws, 2, c0 - 1, { v: "preço →", s: { alignment: { horizontal: "right" }, font: { italic: true, color: { rgb: "FF595959" } } } });
  cols.forEach((c, i) => put(ws, 2, c0 + i, { v: c.preco, s: { numFmt: MOEDA, alignment: { horizontal: "center" }, font: { sz: 9 } } }));
  fixos.forEach((f, i) => put(ws, 3, i, { v: f.titulo, s: sCab }));
  cols.forEach((c, i) => put(ws, 3, c0 + i, { v: c.sub ? `${c.nome}\n${c.sub}` : c.nome, s: sCab }));
  put(ws, 3, cFalt, { v: "Faltam", s: sCab });
  put(ws, 3, cCusto, { v: "Custo", s: sCab });

  const marca = (e: Estado, data: string | null) => (e === "OK" ? `✓ ${d2(data)}` : e === "VENCIDO" ? `V ${d2(data)}` : e === "EXTRA" ? `+ ${d2(data)}` : e === "FALTA" ? "X" : "—");
  const faltaCel = (e: Estado) => e === "FALTA" || e === "VENCIDO";
  let somaFalt = 0, somaCusto = 0;
  const custoLinha: number[] = [];
  linhas.forEach((l, k) => {
    const r = R0 + k;
    fixos.forEach((f, i) => put(ws, r, i, { v: f.val(l), s: { border: borda, ...(i === 0 ? { font: { bold: false } } : {}), ...(f.s?.(l) ?? {}) } }));
    let falt = 0, custo = 0;
    cols.forEach((c, i) => {
      const cel = l.celulas[c.id] ?? { estado: "NA" as Estado, data: null };
      const cor = COR[cel.estado];
      put(ws, r, c0 + i, { v: marca(cel.estado, cel.data), s: { font: { color: { rgb: cor.font }, bold: !!cor.bold }, fill: { fgColor: { rgb: cor.fill } }, alignment: { horizontal: "center" }, border: borda } });
      if (faltaCel(cel.estado)) { falt++; if (!c.base) custo += c.preco; }
    });
    if (baseIdx >= 0 && falt > 0) custo += cols[baseIdx].preco;
    somaFalt += falt; somaCusto += custo; custoLinha.push(custo);
    const faixa = `${col(c0)}${r + 1}:${col(cN)}${r + 1}`;
    put(ws, r, cFalt, { v: falt, f: `COUNTIF(${faixa},"X")+COUNTIF(${faixa},"V*")`, s: { border: borda, alignment: { horizontal: "center" }, font: { bold: falt > 0, color: { rgb: falt > 0 ? "FF9C0006" : "FF7F7F7F" } } } });
    // Custo: itens que faltam × preço (+ exame clínico uma vez, se faltar algo).
    const ini = baseIdx >= 0 ? c0 + 1 : c0;
    const faixaCusto = `${col(ini)}${r + 1}:${col(cN)}${r + 1}`, faixaPreco = `${col(ini)}$3:${col(cN)}$3`;
    const fCusto = ini > cN ? (baseIdx >= 0 ? `IF(${col(cFalt)}${r + 1}>0,$${col(c0)}$3,0)` : "0")
      : `SUMPRODUCT(((${faixaCusto}="X")+(LEFT(${faixaCusto},1)="V"))*${faixaPreco})${baseIdx >= 0 ? `+IF(${col(cFalt)}${r + 1}>0,$${col(c0)}$3,0)` : ""}`;
    put(ws, r, cCusto, { v: custo, f: fCusto, s: { border: borda, numFmt: MOEDA } });
  });
  // Totais por coluna
  const rT = rUlt + 1;
  const tot = [
    { rot: `Faltam (X + V)`, fn: (a: string) => `COUNTIF(${a},"X")+COUNTIF(${a},"V*")`, val: (c: Coluna) => linhas.filter((l) => faltaCel(l.celulas[c.id]?.estado ?? "NA")).length },
    { rot: epi ? "Entregues — exigidos (✓)" : "Feitos — exigidos (✓)", fn: (a: string) => `COUNTIF(${a},"✓*")`, val: (c: Coluna) => linhas.filter((l) => l.celulas[c.id]?.estado === "OK").length },
    { rot: epi ? "Entregues — não exigidos (+)" : "Feitos — não exigidos (+)", fn: (a: string) => `COUNTIF(${a},"+*")`, val: (c: Coluna) => linhas.filter((l) => l.celulas[c.id]?.estado === "EXTRA").length },
  ];
  tot.forEach((t, k) => {
    const r = rT + k;
    put(ws, r, 0, { v: t.rot, s: sTotal });
    for (let i = 1; i < nF; i++) put(ws, r, i, { v: "", s: sTotal });
    cols.forEach((c, i) => { const a = `${col(c0 + i)}${R0 + 1}:${col(c0 + i)}${rUlt + 1}`; put(ws, r, c0 + i, { v: t.val(c), f: nL ? t.fn(a) : undefined, s: { ...sTotal, alignment: { horizontal: "center" } } }); });
  });
  put(ws, rT, cFalt, { v: somaFalt, f: nL ? `SUM(${col(cFalt)}${R0 + 1}:${col(cFalt)}${rUlt + 1})` : undefined, s: { ...sTotal, alignment: { horizontal: "center" } } });
  put(ws, rT, cCusto, { v: somaCusto, f: nL ? `SUM(${col(cCusto)}${R0 + 1}:${col(cCusto)}${rUlt + 1})` : undefined, s: { ...sTotal, numFmt: MOEDA } });
  put(ws, rT, 1, { v: `${nL} colab.`, s: sTotal });
  const rCusto = rT + tot.length;
  put(ws, rCusto, 0, { v: "Custo dos que faltam", s: sTotal });
  for (let i = 1; i < nF; i++) put(ws, rCusto, i, { v: "", s: sTotal });
  cols.forEach((c, i) => put(ws, rCusto, c0 + i, { v: tot[0].val(c) * c.preco, f: `${col(c0 + i)}${rT + 1}*${col(c0 + i)}3`, s: { ...sTotal, numFmt: MOEDA } }));
  put(ws, rCusto, cCusto, { v: cols.reduce((s, c) => s + tot[0].val(c) * c.preco, 0), f: `SUM(${col(c0)}${rCusto + 1}:${col(cN)}${rCusto + 1})`, s: { ...sTotal, numFmt: MOEDA } });
  ref(ws, rCusto + 1, cCusto + 1);
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cCusto } }, { s: { r: 1, c: 0 }, e: { r: 1, c: cCusto } }];
  ws["!cols"] = [...fixos.map((f) => ({ wch: f.w })), ...cols.map(() => ({ wch: 12 })), { wch: 7 }, { wch: 12 }];
  ws["!rows"] = [{ hpt: 22 }, { hpt: 42 }, { hpt: 16 }, { hpt: 48 }];
  if (nL) ws["!autofilter"] = { ref: `A4:${col(cCusto)}${rUlt + 1}` };

  // ── Aba 1: resumo ──────────────────────────────────────────────────────────
  const wr: Ws = {};
  let r = 0;
  put(wr, r++, 0, { v: `${epi ? "EPIs a entregar" : "Exames a realizar"} — resumo`, s: sTitulo });
  put(wr, r++, 0, { v: `${empresaNome}. Situação em ${hoje}. Detalhe por colaborador na aba '${nomeAba}'; ${epi ? "kit" : "exames"} por função na aba 'Por função'.`, s: sNota });
  r++;
  put(wr, r++, 1, { v: "Total", s: sCab });
  const resumoTotais: [string, number, string, Record<string, unknown>?][] = [
    [epi ? "Colaboradores (com EPI a entregar ou trocar)" : "Colaboradores (com algo a fazer)", linhas.filter((_, k) => custoLinha[k] > 0 || Object.values(linhas[k].celulas).some((c) => faltaCel(c.estado))).length, `COUNTIF(${q}!${col(cFalt)}${R0 + 1}:${col(cFalt)}${Math.max(R0 + 1, rUlt + 1)},">0")`],
    [epi ? "EPIs que faltam ou a trocar" : "Exames que faltam (incl. exame clínico)", somaFalt, `${q}!${col(cFalt)}${rT + 1}`],
    ["Custo", somaCusto, `${q}!${col(cCusto)}${rT + 1}`, { numFmt: MOEDA }],
  ];
  for (const [rot, v, f, s] of resumoTotais) { put(wr, r, 0, { v: rot, s: { border: borda } }); put(wr, r, 1, { v, f, s: { border: borda, font: { bold: true }, ...(s ?? {}) } }); r++; }
  r++;
  const cabItens = epi ? [itemTxt, "CA", "Custo unit.", "Faltam (X + V)", "Custo", "Não exigidos (+)", "Em estoque", "Em pedido (PC aberto)", "Comprar", "Pedidos"] : [itemTxt, "Preço", "Faltam (X + V)", "Custo", "Feitos não exigidos (+)"];
  cabItens.forEach((t, i) => put(wr, r, i, { v: t, s: sCab }));
  const rIni = ++r;
  cols.forEach((c, i) => {
    const cc = col(c0 + i);
    const falt = tot[0].val(c), extra = tot[2].val(c);
    if (epi) {
      const comprar = Math.max(0, falt - (c.saldo ?? 0) - (c.emPedido ?? 0));
      put(wr, r, 0, { v: c.nome, s: { border: borda } });
      put(wr, r, 1, { v: (c.sub ?? "").replace(/^CA /, ""), s: { border: borda, alignment: { horizontal: "center" } } });
      put(wr, r, 2, { v: c.preco, s: { border: borda, numFmt: MOEDA } });
      put(wr, r, 3, { v: falt, f: `${q}!${cc}${rT + 1}`, s: { border: borda, alignment: { horizontal: "center" }, font: { bold: falt > 0, color: { rgb: falt > 0 ? "FF9C0006" : "FF000000" } } } });
      put(wr, r, 4, { v: falt * c.preco, f: `C${r + 1}*D${r + 1}`, s: { border: borda, numFmt: MOEDA } });
      put(wr, r, 5, { v: extra, f: `${q}!${cc}${rT + 3}`, s: { border: borda, alignment: { horizontal: "center" } } });
      put(wr, r, 6, { v: c.saldo ?? 0, s: { border: borda, alignment: { horizontal: "center" } } });
      put(wr, r, 7, { v: c.emPedido ?? 0, s: { border: borda, alignment: { horizontal: "center" } } });
      put(wr, r, 8, { v: comprar, f: `MAX(0,D${r + 1}-G${r + 1}-H${r + 1})`, s: { border: borda, alignment: { horizontal: "center" }, font: { bold: comprar > 0, color: { rgb: comprar > 0 ? "FF9C0006" : "FF000000" } } } });
      put(wr, r, 9, { v: (c.pedidos ?? []).join(", "), s: { border: borda, font: { sz: 9, color: { rgb: "FF595959" } } } });
    } else {
      put(wr, r, 0, { v: c.nome, s: { border: borda } });
      put(wr, r, 1, { v: c.preco, s: { border: borda, numFmt: MOEDA } });
      put(wr, r, 2, { v: falt, f: `${q}!${cc}${rT + 1}`, s: { border: borda, alignment: { horizontal: "center" } } });
      put(wr, r, 3, { v: falt * c.preco, f: `B${r + 1}*C${r + 1}`, s: { border: borda, numFmt: MOEDA } });
      put(wr, r, 4, { v: extra, f: `${q}!${cc}${rT + 3}`, s: { border: borda, alignment: { horizontal: "center" } } });
    }
    r++;
  });
  const rFim = r - 1;
  put(wr, r, 0, { v: "Total", s: sTotal });
  if (epi) {
    put(wr, r, 1, { v: "", s: sTotal }); put(wr, r, 2, { v: "", s: sTotal });
    put(wr, r, 3, { v: somaFalt, f: `SUM(D${rIni + 1}:D${rFim + 1})`, s: { ...sTotal, alignment: { horizontal: "center" } } });
    put(wr, r, 4, { v: cols.reduce((s, c) => s + tot[0].val(c) * c.preco, 0), f: `SUM(E${rIni + 1}:E${rFim + 1})`, s: { ...sTotal, numFmt: MOEDA } });
    put(wr, r, 5, { v: cols.reduce((s, c) => s + tot[2].val(c), 0), f: `SUM(F${rIni + 1}:F${rFim + 1})`, s: { ...sTotal, alignment: { horizontal: "center" } } });
    put(wr, r, 6, { v: "", s: sTotal }); put(wr, r, 7, { v: "", s: sTotal });
    put(wr, r, 8, { v: cols.reduce((s, c) => s + Math.max(0, tot[0].val(c) - (c.saldo ?? 0) - (c.emPedido ?? 0)), 0), f: `SUM(I${rIni + 1}:I${rFim + 1})`, s: { ...sTotal, alignment: { horizontal: "center" } } });
    put(wr, r, 9, { v: "", s: sTotal });
  } else {
    put(wr, r, 1, { v: "", s: sTotal });
    put(wr, r, 2, { v: somaFalt, f: `SUM(C${rIni + 1}:C${rFim + 1})`, s: { ...sTotal, alignment: { horizontal: "center" } } });
    put(wr, r, 3, { v: cols.reduce((s, c) => s + tot[0].val(c) * c.preco, 0), f: `SUM(D${rIni + 1}:D${rFim + 1})`, s: { ...sTotal, numFmt: MOEDA } });
    put(wr, r, 4, { v: cols.reduce((s, c) => s + tot[2].val(c), 0), f: `SUM(E${rIni + 1}:E${rFim + 1})`, s: { ...sTotal, alignment: { horizontal: "center" } } });
  }
  r += 2;
  // Quebra secundária: exames por "quando fazer"; EPI por setor.
  const grupos = new Map<string, { n: number; itens: number; custo: number; ordem: string }>();
  linhas.forEach((l, k) => {
    const itens = Object.values(l.celulas).filter((c) => faltaCel(c.estado)).length;
    if (!itens) return;
    let chave: string, ordem: string;
    if (epi) { chave = l.setor ?? "Sem setor"; ordem = chave; }
    else if (l.info.fazerEm === "JÁ") { chave = "Já (ASO vencido ou sem ASO)"; ordem = "0"; }
    else { const d = new Date(l.info.fazerEm ?? ""); chave = isNaN(+d) ? "Sem data" : `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`; ordem = isNaN(+d) ? "9" : `1${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`; }
    const g = grupos.get(chave) ?? { n: 0, itens: 0, custo: 0, ordem };
    g.n++; g.itens += itens; g.custo += custoLinha[k];
    grupos.set(chave, g);
  });
  [epi ? "Setor" : "Quando fazer (próximo periódico)", "Colaboradores", epi ? "EPIs" : "Exames", "Custo"].forEach((t, i) => put(wr, r, i, { v: t, s: sCab }));
  r++;
  const gIni = r;
  for (const [k, g] of Array.from(grupos).sort((a, b) => a[1].ordem.localeCompare(b[1].ordem, "pt-BR"))) {
    put(wr, r, 0, { v: k, s: { border: borda } }); put(wr, r, 1, { v: g.n, s: { border: borda, alignment: { horizontal: "center" } } });
    put(wr, r, 2, { v: g.itens, s: { border: borda, alignment: { horizontal: "center" } } }); put(wr, r, 3, { v: g.custo, s: { border: borda, numFmt: MOEDA } });
    r++;
  }
  put(wr, r, 0, { v: "Total", s: sTotal });
  put(wr, r, 1, { v: Array.from(grupos.values()).reduce((s, g) => s + g.n, 0), f: r > gIni ? `SUM(B${gIni + 1}:B${r})` : undefined, s: { ...sTotal, alignment: { horizontal: "center" } } });
  put(wr, r, 2, { v: Array.from(grupos.values()).reduce((s, g) => s + g.itens, 0), f: r > gIni ? `SUM(C${gIni + 1}:C${r})` : undefined, s: { ...sTotal, alignment: { horizontal: "center" } } });
  put(wr, r, 3, { v: Array.from(grupos.values()).reduce((s, g) => s + g.custo, 0), f: r > gIni ? `SUM(D${gIni + 1}:D${r})` : undefined, s: { ...sTotal, numFmt: MOEDA } });
  r += 2;
  const notas = epi
    ? [
        "• Entram os colaboradores ativos com função SST. Não entram afastados/em benefício" + (D.fora.afastados ? ` (${D.fora.afastados})` : "") + ", desligados e quem está sem função" + (D.fora.semFuncao ? ` (${D.fora.semFuncao})` : "") + ".",
        "• 'Faltam' = EPI exigido nunca entregue (X) + entregue com a troca prevista vencida (V). EPI entregue e dentro do prazo não é pendência.",
        "• Custo unitário = custo médio do item no estoque da empresa. 'Comprar' = faltam − saldo em estoque (todos os tamanhos do EPI) − em pedido de compra aberto (aguardando aprovação, pagamento ou em trânsito).",
        "• Azul (+) = EPI entregue que a função não exige: fica registrado, mas não conta como entregue do exigido nem entra no custo.",
      ]
    : [
        "• Entram os colaboradores ativos com função SST. Não entram afastados/em benefício" + (D.fora.afastados ? ` (${D.fora.afastados})` : "") + ", desligados e quem está sem função" + (D.fora.semFuncao ? ` (${D.fora.semFuncao})` : "") + ".",
        "• 'Fazer em' = vencimento do ASO (próximo periódico); 'JÁ' = ASO vencido ou inexistente. Os exames que faltam (X) e os vencidos (V) entram nesse periódico.",
        "• Azul (+) = exame feito que a função NÃO exige: fica registrado, mas não conta como feito do exigido nem entra no custo.",
        "• Preços: cadastro de tipos de exame (SST › Configurações). Exame clínico cobrado de quem tem algo a fazer, pois os exames constam no ASO periódico.",
      ];
  const rNotas = r;
  for (const n of notas) { put(wr, r, 0, { v: n, s: sNota }); r++; }
  ref(wr, r, epi ? 10 : 6);
  wr["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }, ...notas.map((_, i) => ({ s: { r: rNotas + i, c: 0 }, e: { r: rNotas + i, c: epi ? 9 : 5 } }))];
  wr["!cols"] = epi ? [{ wch: 44 }, { wch: 12 }, { wch: 12 }, { wch: 13 }, { wch: 13 }, { wch: 15 }, { wch: 11 }, { wch: 12 }, { wch: 10 }, { wch: 22 }] : [{ wch: 36 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 20 }];
  wr["!rows"] = [{ hpt: 22 }, { hpt: 30 }];

  // ── Aba 3: por função ──────────────────────────────────────────────────────
  const wf: Ws = {};
  const fx = 3; // GHE, Função, Colab.
  put(wf, 0, 0, { v: epi ? "EPIs exigidos por função e custo do kit" : "Exames exigidos por função e custo do ASO completo", s: sTitulo });
  put(wf, 1, 0, { v: epi ? "Célula = quantidade exigida por colaborador. Custo do kit = soma dos EPIs exigidos × custo unitário (linha 3); × colab. = para todos da função." : "Célula = periodicidade exigida (meses). Custo do ASO completo = exame clínico + exames exigidos. Custo anual = cada exame proporcional à periodicidade (24 meses conta metade por ano).", s: sNota });
  put(wf, 2, fx - 1, { v: "preço →", s: { alignment: { horizontal: "right" }, font: { italic: true, color: { rgb: "FF595959" } } } });
  cols.forEach((c, i) => put(wf, 2, fx + i, { v: c.preco, s: { numFmt: MOEDA, alignment: { horizontal: "center" }, font: { sz: 9 } } }));
  const cabF = ["GHE", "Função", "Colab.", ...cols.map((c) => (c.sub ? `${c.nome}\n${c.sub}` : c.nome)), epi ? "Custo do kit (por colab.)" : "Custo ASO completo (por colab.)", ...(epi ? [] : ["Custo anual por colab."]), epi ? "Kit × colab." : "ASO completo × colab.", ...(epi ? [] : ["Custo anual previsto"])];
  cabF.forEach((t, i) => put(wf, 3, i, { v: t, s: sCab }));
  const fs = [...D.funcoes].sort((a, b) => (a.ghe ?? "~").localeCompare(b.ghe ?? "~", "pt-BR", { numeric: true }) || a.nome.localeCompare(b.nome, "pt-BR"));
  const cK = fx + cols.length;
  fs.forEach((f, k) => {
    const rr = 4 + k;
    put(wf, rr, 0, { v: f.ghe ?? "", s: { border: borda } }); put(wf, rr, 1, { v: f.nome, s: { border: borda } }); put(wf, rr, 2, { v: f.n, s: { border: borda, alignment: { horizontal: "center" } } });
    let kit = 0, anual = 0;
    cols.forEach((c, i) => {
      const x = f.exigidos[c.id];
      if (x != null) { kit += epi ? x * c.preco : c.preco; anual += epi ? 0 : (c.preco * 12) / x; }
      put(wf, rr, fx + i, { v: x ?? "—", s: { border: borda, alignment: { horizontal: "center" }, ...(x == null ? { font: { color: { rgb: "FFBFBFBF" } }, fill: { fgColor: { rgb: "FFF2F2F2" } } } : {}) } });
    });
    const faixa = `${col(fx)}${rr + 1}:${col(fx + cols.length - 1)}${rr + 1}`, precos = `${col(fx)}$3:${col(fx + cols.length - 1)}$3`;
    // Quantidade exigida é 1 em todas as funções hoje; a fórmula soma o preço dos exigidos.
    const fKit = `SUMPRODUCT(ISNUMBER(${faixa})*${precos})`;
    put(wf, rr, cK, { v: kit, f: cols.length ? fKit : undefined, s: { border: borda, numFmt: MOEDA } });
    if (epi) {
      put(wf, rr, cK + 1, { v: kit * f.n, f: `${col(cK)}${rr + 1}*C${rr + 1}`, s: { border: borda, numFmt: MOEDA } });
    } else {
      put(wf, rr, cK + 1, { v: anual, s: { border: borda, numFmt: MOEDA } });
      put(wf, rr, cK + 2, { v: kit * f.n, f: `${col(cK)}${rr + 1}*C${rr + 1}`, s: { border: borda, numFmt: MOEDA } });
      put(wf, rr, cK + 3, { v: anual * f.n, f: `${col(cK + 1)}${rr + 1}*C${rr + 1}`, s: { border: borda, numFmt: MOEDA } });
    }
  });
  const rTf = 4 + fs.length;
  put(wf, rTf, 0, { v: "", s: sTotal }); put(wf, rTf, 1, { v: "TOTAL", s: sTotal });
  put(wf, rTf, 2, { v: fs.reduce((s, f) => s + f.n, 0), f: fs.length ? `SUM(C5:C${rTf})` : undefined, s: { ...sTotal, alignment: { horizontal: "center" } } });
  for (let i = fx; i < cK + 1; i++) put(wf, rTf, i, { v: "", s: sTotal });
  const ultF = epi ? cK + 1 : cK + 3;
  for (let i = cK + 1; i <= ultF; i++) {
    if (!epi && i === cK + 1) { put(wf, rTf, i, { v: "", s: sTotal }); continue; }
    put(wf, rTf, i, { v: 0, f: fs.length ? `SUM(${col(i)}5:${col(i)}${rTf})` : undefined, s: { ...sTotal, numFmt: MOEDA } });
  }
  ref(wf, rTf + 1, ultF + 1);
  wf["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: ultF } }, { s: { r: 1, c: 0 }, e: { r: 1, c: ultF } }];
  wf["!cols"] = [{ wch: 26 }, { wch: 30 }, { wch: 7 }, ...cols.map(() => ({ wch: 11 })), { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
  wf["!rows"] = [{ hpt: 22 }, { hpt: 30 }, { hpt: 16 }, { hpt: 48 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wr as never, "Resumo");
  XLSX.utils.book_append_sheet(wb, ws as never, nomeAba);
  XLSX.utils.book_append_sheet(wb, wf as never, "Por função");
  XLSX.writeFile(wb, `${epi ? "EPIs a entregar" : "Exames a realizar"} - ${hoje.replace(/\//g, "-")}.xlsx`);
}
