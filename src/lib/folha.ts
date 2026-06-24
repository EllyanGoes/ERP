import Anthropic from "@anthropic-ai/sdk";
import { get } from "@vercel/blob";
import { prismaSemEscopo } from "@/lib/prisma";
import { decimalToNumber, generateSimpleDocNumber } from "@/lib/utils";
import { proximaSequenciaDaEmpresa } from "@/lib/empresa";
import { registrarLancamento, contaPorCodigo, type PartidaIn } from "@/lib/contabilidade";
import { garantirContasFolha, garantirContaColaboradorNaEmpresa, garantirContaDespesaFallback } from "@/lib/conta-contabil";

const round = (v: number) => Math.round(v * 100) / 100;
const n = (v: unknown) => decimalToNumber(v);

function mesAnoDe(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

type ItemFolha = {
  colaboradorId: string | null;
  nome: string;
  classificacao: "MOD" | "MOI" | "ADMIN";
  bruto: unknown; liquido: unknown; inssRetido: unknown; inssPatronal: unknown; irrf: unknown; fgts: unknown;
};

// Custo do empregador por colaborador = bruto + INSS patronal + FGTS.
// "Outros a repassar" por item = bruto − líquido − INSS retido − IRRF (plug que
// garante o balanço, capturando adiantamento/consignado/faltas etc.).
function valoresItem(it: ItemFolha) {
  const bruto = n(it.bruto), liquido = n(it.liquido), inssRetido = n(it.inssRetido);
  const inssPatronal = n(it.inssPatronal), irrf = n(it.irrf), fgts = n(it.fgts);
  return {
    bruto, liquido, inssRetido, inssPatronal, irrf, fgts,
    custo: bruto + inssPatronal + fgts,
    outros: round(bruto - liquido - inssRetido - irrf),
  };
}

/**
 * Apropriação da folha (lançamento composto, idempotente por folhaId):
 *   D PEP-MOD / CIF a Apropriar / Despesa   (custo por classificação)
 *   C Salários a Pagar (por colaborador), INSS, IRRF, FGTS, Outros a Repassar.
 */
export async function contabilizarFolha(folhaId: string) {
  const folha = await prismaSemEscopo.folhaPagamento.findUnique({
    where: { id: folhaId },
    select: {
      id: true, empresaId: true, competencia: true,
      itens: { select: { colaboradorId: true, nome: true, classificacao: true, bruto: true, liquido: true, inssRetido: true, inssPatronal: true, irrf: true, fgts: true } },
    },
  });
  if (!folha) throw new Error("Folha não encontrada");
  const semColab = folha.itens.filter((i) => !i.colaboradorId);
  if (semColab.length) throw new Error(`Vincule todos os colaboradores antes de fechar (faltam ${semColab.length}).`);

  const empresaId = folha.empresaId;
  const [pepMod, despesa, contas] = await Promise.all([
    contaPorCodigo(empresaId, "1.1.3.0005.0002"),
    garantirContaDespesaFallback(empresaId),
    garantirContasFolha(empresaId),
  ]);
  if (!pepMod) throw new Error("Conta PEP-MOD (1.1.3.0005.0002) não encontrada — verifique o plano de contas.");
  if (!despesa) throw new Error("Conta de despesa (3.3) não encontrada.");
  const { inssId, irrfId, fgtsId, outrosId, cifApropriarId } = contas;
  if (!inssId || !irrfId || !fgtsId || !outrosId || !cifApropriarId) {
    throw new Error("Não foi possível garantir as contas de passivo/CIF da folha.");
  }

  let custoMod = 0, custoMoi = 0, custoAdmin = 0;
  let totInss = 0, totIrrf = 0, totFgts = 0, totOutros = 0;
  const liqPorColab = new Map<string, number>();
  for (const it of folha.itens) {
    const v = valoresItem(it as ItemFolha);
    if (it.classificacao === "MOD") custoMod += v.custo;
    else if (it.classificacao === "MOI") custoMoi += v.custo;
    else custoAdmin += v.custo;
    liqPorColab.set(it.colaboradorId!, (liqPorColab.get(it.colaboradorId!) ?? 0) + v.liquido);
    totInss += v.inssRetido + v.inssPatronal;
    totIrrf += v.irrf;
    totFgts += v.fgts;
    totOutros += v.outros;
  }

  const partidas: PartidaIn[] = [];
  if (round(custoMod) > 0) partidas.push({ contaId: pepMod.id, tipo: "DEBITO", valor: round(custoMod) });
  if (round(custoMoi) > 0) partidas.push({ contaId: cifApropriarId, tipo: "DEBITO", valor: round(custoMoi) });
  if (round(custoAdmin) > 0) partidas.push({ contaId: despesa.id, tipo: "DEBITO", valor: round(custoAdmin) });
  for (const [colabId, liq] of Array.from(liqPorColab.entries())) {
    if (round(liq) <= 0) continue;
    const c = await garantirContaColaboradorNaEmpresa(empresaId, colabId);
    if (!c) throw new Error("Conta de Salários a Pagar do colaborador não pôde ser criada.");
    partidas.push({ contaId: c.id, tipo: "CREDITO", valor: round(liq) });
  }
  if (round(totInss) > 0) partidas.push({ contaId: inssId, tipo: "CREDITO", valor: round(totInss) });
  if (round(totIrrf) > 0) partidas.push({ contaId: irrfId, tipo: "CREDITO", valor: round(totIrrf) });
  if (round(totFgts) > 0) partidas.push({ contaId: fgtsId, tipo: "CREDITO", valor: round(totFgts) });
  if (round(totOutros) > 0) partidas.push({ contaId: outrosId, tipo: "CREDITO", valor: round(totOutros) });

  const lanc = await registrarLancamento({
    empresaId, data: folha.competencia,
    historico: `Apropriação da folha ${mesAnoDe(folha.competencia)}`,
    origemTipo: "FOLHA_PAGAMENTO", origemId: folha.id,
    partidas,
  });
  await prismaSemEscopo.folhaPagamento.update({ where: { id: folha.id }, data: { lancamentoId: lanc.id } });
  return lanc;
}

/**
 * Gera as Contas a Pagar das obrigações da folha (líquido por colaborador, INSS,
 * IRRF, FGTS), já apropriadas (semProvisao). Idempotente por folhaId.
 */
export async function gerarContasPagarFolha(folhaId: string) {
  const folha = await prismaSemEscopo.folhaPagamento.findUnique({
    where: { id: folhaId },
    select: {
      id: true, empresaId: true, competencia: true, dataVencimento: true, dataPagamento: true,
      itens: { select: { colaboradorId: true, nome: true, bruto: true, liquido: true, inssRetido: true, inssPatronal: true, irrf: true, fgts: true } },
    },
  });
  if (!folha) throw new Error("Folha não encontrada");
  const jaTem = await prismaSemEscopo.contaPagar.count({ where: { folhaId: folha.id } });
  if (jaTem > 0) return;

  const empresaId = folha.empresaId;
  const venc = folha.dataVencimento ?? folha.dataPagamento ?? folha.competencia;
  const mesAno = mesAnoDe(folha.competencia);
  const { inssId, irrfId, fgtsId, outrosId } = await garantirContasFolha(empresaId);

  type Titulo = { descricao: string; valor: number; beneficiarioId?: string; contaPassivoId?: string | null };
  const titulos: Titulo[] = [];

  const liqPorColab = new Map<string, { liq: number; nome: string }>();
  let totInss = 0, totIrrf = 0, totFgts = 0, totOutros = 0;
  for (const it of folha.itens) {
    totInss += n(it.inssRetido) + n(it.inssPatronal);
    totIrrf += n(it.irrf);
    totFgts += n(it.fgts);
    totOutros += round(n(it.bruto) - n(it.liquido) - n(it.inssRetido) - n(it.irrf));
    if (it.colaboradorId) {
      const cur = liqPorColab.get(it.colaboradorId) ?? { liq: 0, nome: it.nome };
      cur.liq += n(it.liquido);
      liqPorColab.set(it.colaboradorId, cur);
    }
  }
  for (const [colabId, { liq, nome }] of Array.from(liqPorColab.entries())) {
    if (round(liq) > 0) titulos.push({ descricao: `Salário ${mesAno} — ${nome}`, valor: round(liq), beneficiarioId: colabId });
  }
  if (round(totInss) > 0 && inssId) titulos.push({ descricao: `INSS ${mesAno}`, valor: round(totInss), contaPassivoId: inssId });
  if (round(totIrrf) > 0 && irrfId) titulos.push({ descricao: `IRRF ${mesAno}`, valor: round(totIrrf), contaPassivoId: irrfId });
  if (round(totFgts) > 0 && fgtsId) titulos.push({ descricao: `FGTS ${mesAno}`, valor: round(totFgts), contaPassivoId: fgtsId });
  if (round(totOutros) > 0 && outrosId) titulos.push({ descricao: `Retenções/consignados ${mesAno}`, valor: round(totOutros), contaPassivoId: outrosId });

  for (const t of titulos) {
    const numero = generateSimpleDocNumber("CP", await proximaSequenciaDaEmpresa(empresaId, "CP"));
    await prismaSemEscopo.contaPagar.create({
      data: {
        empresaId, numero, descricao: t.descricao, valorOriginal: t.valor,
        dataVencimento: venc, dataCompetencia: folha.competencia,
        categoria: "Folha de Pagamento", status: "ABERTA",
        semProvisao: true, folhaId: folha.id,
        beneficiarioTipo: t.beneficiarioId ? "COLABORADOR" : null,
        beneficiarioId: t.beneficiarioId ?? null,
        contaPassivoId: t.contaPassivoId ?? null,
      },
    });
  }
}

// ── Extração por IA (Claude) ────────────────────────────────────────────────
const MODELO_EXTRACAO = process.env.FOLHA_EXTRACAO_MODELO ?? "claude-sonnet-4-6";

type ColaboradorExtraido = {
  matricula?: string; nome: string; cargo?: string;
  bruto: number; liquido: number; inssRetido: number; inssPatronal?: number; irrf: number; fgts: number;
};
type FolhaExtraida = { competencia?: string; dataPagamento?: string; colaboradores: ColaboradorExtraido[] };

const PROMPT_EXTRACAO = `Você recebe um PDF de FOLHA DE PAGAMENTO brasileira (uma empresa, uma competência).
Extraia os dados em JSON ESTRITO (sem comentários, sem markdown), no formato:
{
  "competencia": "MM/AAAA",
  "dataPagamento": "AAAA-MM-DD",
  "colaboradores": [
    { "matricula": "string", "nome": "string", "cargo": "string",
      "bruto": number, "liquido": number, "inssRetido": number,
      "inssPatronal": number, "irrf": number, "fgts": number }
  ]
}
Regras:
- "bruto" = TOTAL DE PROVENTOS do colaborador; "liquido" = SALÁRIO LÍQUIDO.
- "inssRetido" = INSS descontado do empregado (rubrica de desconto, ex.: "INSS - MENSAL").
- "irrf" = IRRF retido (0 se não houver).
- "fgts" = FGTS A RECOLHER do colaborador (não é desconto do líquido).
- "inssPatronal" = INSS patronal do colaborador se o documento informar; senão 0.
- Use ponto decimal e números puros (sem "R$", sem separador de milhar). Inclua TODOS os colaboradores.
Responda APENAS o JSON.`;

function parseCompetencia(s?: string): Date | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})\s*\/\s*(\d{4})/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[2]), Number(m[1]) - 1, 1));
}

function extrairJson(texto: string): unknown {
  const limpo = texto.replace(/```json\s*|\s*```/g, "").trim();
  const ini = limpo.indexOf("{");
  const fim = limpo.lastIndexOf("}");
  if (ini < 0 || fim < 0) throw new Error("A IA não retornou JSON.");
  return JSON.parse(limpo.slice(ini, fim + 1));
}

// Extração via IA (Claude): manda o PDF e recebe o JSON estruturado.
async function extrairViaIA(pdfBuf: Buffer): Promise<FolhaExtraida> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const resp = await client.messages.create({
    model: MODELO_EXTRACAO,
    max_tokens: 16000,
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBuf.toString("base64") } },
        { type: "text", text: PROMPT_EXTRACAO },
      ],
    }],
  });
  const texto = resp.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("\n");
  return extrairJson(texto) as FolhaExtraida;
}

// Parser determinístico da folha Senior (fallback sem IA). Usa âncoras estáveis
// (TOTAL DE PROVENTOS, SALÁRIO LÍQUIDO, FGTS A RECOLHER MÊS) — bruto/líquido/FGTS
// por colaborador. As demais retenções (INSS/IRRF) entram em "Outros a Repassar"
// (o balanço fecha); a IA faz a separação fina quando disponível.
function parseFolhaSenior(text: string): FolhaExtraida {
  const num = (s?: string) => s ? parseFloat(s.replace(/\./g, "").replace(",", ".")) : 0;
  const competencia = text.match(/COMPET[ÊE]NCIA\s*:?\s*(\d{1,2}\/\d{4})/)?.[1];
  const dp = text.match(/DATA DO PAGAMENTO\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})/);
  const dataPagamento = dp ? `${dp[3]}-${dp[2]}-${dp[1]}` : undefined;

  // Âncoras de nome: NOME (maiúsculas) seguido da matrícula (5-6 dígitos).
  const nomeRe = /([A-ZÀ-Ý][A-ZÀ-Ý '.\-]{4,}?)\s?(\d{5,6})(?=\s|$)/g;
  const nomes: { idx: number; nome: string; matricula: string }[] = [];
  let mn: RegExpExecArray | null;
  while ((mn = nomeRe.exec(text))) nomes.push({ idx: mn.index, nome: mn[1].trim().replace(/\s+/g, " "), matricula: mn[2] });

  // Bloco do FGTS: rótulos agrupados e os valores depois (FGTS a recolher = 2º).
  const fgtsRe = /BASE DO FGTS\s+FGTS A RECOLHER M[ÊE]S\s+BASE DO FGTS M[ÊE]S\s+ASSINATURA\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})/;
  const liqRe = /SAL[ÁA]RIO L[ÍI]QUIDO\s*:?\s*([\d.]+,\d{2})/g;
  const colaboradores: ColaboradorExtraido[] = [];
  let ml: RegExpExecArray | null;
  while ((ml = liqRe.exec(text))) {
    const liquido = num(ml[1]);
    const janela = text.slice(ml.index, ml.index + 700);
    const bruto = num(janela.match(/TOTAL DE PROVENTOS\s*:?\s*([\d.]+,\d{2})/)?.[1]);
    const fgts = num(janela.match(fgtsRe)?.[2]);
    let nomeAnt: { idx: number; nome: string; matricula: string } | undefined;
    for (const nm of nomes) { if (nm.idx < ml.index) nomeAnt = nm; else break; }
    const perto = nomeAnt && (ml.index - nomeAnt.idx) < 2500;
    // Sanidade: descarta linhas de resumo (líquido > bruto) e blocos sem nome próximo.
    if (bruto > 0 && liquido <= bruto + 0.01 && perto) {
      colaboradores.push({ nome: nomeAnt!.nome, matricula: nomeAnt!.matricula, bruto, liquido, inssRetido: 0, irrf: 0, fgts, inssPatronal: 0 });
    }
  }
  return { competencia, dataPagamento, colaboradores };
}

// Extração via parser (sem IA): extrai o texto do PDF com unpdf e aplica o parser.
async function extrairViaParser(pdfBuf: Buffer): Promise<FolhaExtraida> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(pdfBuf));
  const { text } = await extractText(pdf, { mergePages: true });
  return parseFolhaSenior(Array.isArray(text) ? text.join("\n") : text);
}

// Lê o PDF (privado) do Vercel Blob via SDK. O pathname é derivado da URL salva.
export async function lerPdfDaFolha(arquivoUrl: string): Promise<Buffer> {
  const pathname = new URL(arquivoUrl).pathname.replace(/^\//, "");
  const res = await get(pathname, { access: "private" });
  if (!res) throw new Error("Arquivo da folha não encontrado no armazenamento.");
  return Buffer.from(await new Response(res.stream).arrayBuffer());
}

/**
 * Extrai a folha do PDF (Claude) e (re)popula os FolhaItem + cabeçalho/totais.
 * Casa cada item a um Colaborador pelo nome (exato, ignorando caixa) e herda a
 * classificação do cadastro; sem match fica null (o usuário vincula na revisão).
 */
export async function extrairFolhaPdf(folhaId: string) {
  const folha = await prismaSemEscopo.folhaPagamento.findUnique({
    where: { id: folhaId }, select: { id: true, empresaId: true, arquivoUrl: true, status: true },
  });
  if (!folha) throw new Error("Folha não encontrada");
  if (folha.status === "FECHADA") throw new Error("Folha já fechada — não pode reextrair.");
  if (!folha.arquivoUrl) throw new Error("Folha sem arquivo PDF.");

  const pdfBuf = await lerPdfDaFolha(folha.arquivoUrl);
  // Com a chave da IA usa o Claude; senão (ou se a IA falhar) cai no parser
  // determinístico da folha Senior.
  let dados: FolhaExtraida;
  if (process.env.ANTHROPIC_API_KEY) {
    try { dados = await extrairViaIA(pdfBuf); }
    catch { dados = await extrairViaParser(pdfBuf); }
  } else {
    dados = await extrairViaParser(pdfBuf);
  }
  if (!dados?.colaboradores?.length) throw new Error("Não foi possível extrair colaboradores do PDF.");

  // Colaboradores da empresa p/ casar por MATRÍCULA (estável) e depois por nome.
  const colabs = await prismaSemEscopo.colaborador.findMany({
    where: { empresas: { some: { id: folha.empresaId } } },
    select: { id: true, nome: true, matricula: true, classificacaoCusto: true },
  });
  const porMatricula = new Map(colabs.filter((c) => c.matricula).map((c) => [c.matricula!.trim(), c]));
  const porNome = new Map(colabs.map((c) => [c.nome.trim().toLowerCase(), c]));

  const itensData = dados.colaboradores.map((c) => {
    const match = (c.matricula ? porMatricula.get(c.matricula.trim()) : null)
      ?? porNome.get((c.nome ?? "").trim().toLowerCase()) ?? null;
    return {
      folhaId: folha.id,
      colaboradorId: match?.id ?? null,
      matricula: c.matricula ?? null,
      nome: c.nome,
      cargo: c.cargo ?? null,
      classificacao: match?.classificacaoCusto ?? "ADMIN" as const,
      bruto: c.bruto ?? 0, liquido: c.liquido ?? 0, inssRetido: c.inssRetido ?? 0,
      inssPatronal: c.inssPatronal ?? 0, irrf: c.irrf ?? 0, fgts: c.fgts ?? 0,
      outrosDescontos: round((c.bruto ?? 0) - (c.liquido ?? 0) - (c.inssRetido ?? 0) - (c.irrf ?? 0)),
    };
  });

  const tot = itensData.reduce((a, i) => ({
    bruto: a.bruto + i.bruto, liquido: a.liquido + i.liquido, inssR: a.inssR + i.inssRetido,
    inssP: a.inssP + i.inssPatronal, irrf: a.irrf + i.irrf, fgts: a.fgts + i.fgts,
  }), { bruto: 0, liquido: 0, inssR: 0, inssP: 0, irrf: 0, fgts: 0 });

  const competencia = parseCompetencia(dados.competencia);
  await prismaSemEscopo.$transaction([
    prismaSemEscopo.folhaItem.deleteMany({ where: { folhaId: folha.id } }),
    prismaSemEscopo.folhaItem.createMany({ data: itensData }),
    prismaSemEscopo.folhaPagamento.update({
      where: { id: folha.id },
      data: {
        ...(competencia ? { competencia } : {}),
        ...(dados.dataPagamento ? { dataPagamento: new Date(dados.dataPagamento) } : {}),
        totalBruto: round(tot.bruto), totalLiquido: round(tot.liquido),
        totalInssRetido: round(tot.inssR), totalInssPatronal: round(tot.inssP),
        totalIrrf: round(tot.irrf), totalFgts: round(tot.fgts),
      },
    }),
  ]);
  return { quantidade: itensData.length, semVinculo: itensData.filter((i) => !i.colaboradorId).length };
}

/** Fecha a folha: valida, apropria e gera as Contas a Pagar. */
export async function fecharFolha(folhaId: string) {
  await contabilizarFolha(folhaId);
  await gerarContasPagarFolha(folhaId);
  await prismaSemEscopo.folhaPagamento.update({ where: { id: folhaId }, data: { status: "FECHADA" } });
}
