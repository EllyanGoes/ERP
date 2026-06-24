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
      itens: { select: { colaboradorId: true, nome: true, liquido: true, inssRetido: true, inssPatronal: true, irrf: true, fgts: true } },
    },
  });
  if (!folha) throw new Error("Folha não encontrada");
  const jaTem = await prismaSemEscopo.contaPagar.count({ where: { folhaId: folha.id } });
  if (jaTem > 0) return;

  const empresaId = folha.empresaId;
  const venc = folha.dataVencimento ?? folha.dataPagamento ?? folha.competencia;
  const mesAno = mesAnoDe(folha.competencia);
  const { inssId, irrfId, fgtsId } = await garantirContasFolha(empresaId);

  type Titulo = { descricao: string; valor: number; beneficiarioId?: string; contaPassivoId?: string | null };
  const titulos: Titulo[] = [];

  const liqPorColab = new Map<string, { liq: number; nome: string }>();
  let totInss = 0, totIrrf = 0, totFgts = 0;
  for (const it of folha.itens) {
    totInss += n(it.inssRetido) + n(it.inssPatronal);
    totIrrf += n(it.irrf);
    totFgts += n(it.fgts);
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

/** Fecha a folha: valida, apropria e gera as Contas a Pagar. */
export async function fecharFolha(folhaId: string) {
  await contabilizarFolha(folhaId);
  await gerarContasPagarFolha(folhaId);
  await prismaSemEscopo.folhaPagamento.update({ where: { id: folhaId }, data: { status: "FECHADA" } });
}
