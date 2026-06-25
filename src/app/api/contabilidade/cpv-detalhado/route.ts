export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { getSession } from "@/lib/auth";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { decimalToNumber } from "@/lib/utils";
import { calcularCusteio } from "@/lib/pcp/custeio-cif";

// GET /api/contabilidade/cpv-detalhado?ano=YYYY
// CPV detalhado por COMPONENTE (Matéria-Prima c/ sub-itens, Embalagens, Mão-de-obra,
// Gastos Gerais de Fabricação, Depreciação), mês a mês. Na absorção o razão posta o
// CPV numa linha só (3.2.2.0001); aqui DERIVAMOS a quebra da composição de custo
// (calcularCusteio) e rateamos o CPV contábil do mês pelos ratios — a soma dos
// componentes = CPV do razão. Não mexe no razão.

const z12 = () => new Array(12).fill(0) as number[];
const r2 = (n: number) => Math.round(n * 100) / 100;

// CPV total por mês do razão (subárvore 3.2.2.*), natureza-ajustado (devedora: D−C).
async function cpvMensalDoRazao(ano: number): Promise<number[]> {
  const ini = new Date(Date.UTC(ano, 0, 1));
  const fim = new Date(Date.UTC(ano, 11, 31, 23, 59, 59, 999));
  const contas = await prisma.contaContabil.findMany({
    where: { grupo: "RESULTADO", tipo: "ANALITICA", ativo: true, codigo: { startsWith: "3.2.2" } },
    select: { id: true, natureza: true },
  });
  const natPorConta = new Map(contas.map((c) => [c.id, c.natureza]));
  const contaIds = contas.map((c) => c.id);
  const meses = z12();
  if (!contaIds.length) return meses;
  const partidas = await prisma.partidaContabil.findMany({
    where: { contaId: { in: contaIds }, lancamento: { data: { gte: ini, lte: fim } } },
    select: { contaId: true, tipo: true, valor: true, lancamento: { select: { data: true } } },
  });
  for (const p of partidas) {
    const mes = new Date(p.lancamento.data).getUTCMonth();
    const sinalDevedor = natPorConta.get(p.contaId) === "CREDORA" ? -1 : 1;
    const v = decimalToNumber(p.valor) * (p.tipo === "DEBITO" ? 1 : -1) * sinalDevedor;
    meses[mes] += v;
  }
  return meses.map(r2);
}

type Item = { nome: string; meses: number[]; total: number };
type Secao = { chave: string; nome: string; meses: number[]; total: number; itens?: Item[] };

export async function GET(req: NextRequest) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;
  const session = await getSession();
  const empresaId = session?.activeEmpresaId ?? EMPRESA_PADRAO_ID;

  const { searchParams } = new URL(req.url);
  const ano = parseInt(searchParams.get("ano") ?? "", 10) || new Date().getUTCFullYear();

  const [cpvMes, cpvMesAnterior] = await Promise.all([cpvMensalDoRazao(ano), cpvMensalDoRazao(ano - 1)]);

  // Composição (ratios) por mês via calcularCusteio. Só os meses com CPV ≠ 0.
  // Cada componente = CPV do razão do mês × (componente.total / custoTotalMilheiro).
  type Ratio = { mp: { nome: string; r: number }[]; emb: { nome: string; r: number }[]; mpTot: number; embTot: number; mod: number; ggf: number; depr: number };
  const ratioVazio: Ratio = { mp: [], emb: [], mpTot: 0, embTot: 0, mod: 0, ggf: 0, depr: 0 };
  const ratios: (Ratio | null)[] = new Array(12).fill(null);

  for (let m = 0; m < 12; m++) {
    if (Math.abs(cpvMes[m]) < 0.005) continue;
    const comp = await calcularCusteio(empresaId, new Date(Date.UTC(ano, m, 1)));
    const tot = comp.composicao.custoTotalMilheiro;
    if (!tot || tot <= 0) continue; // sem composição → fallback depois
    const deprItem = comp.composicao.cif.itens.find((i) => /deprecia/i.test(i.nome));
    const depr = deprItem?.valorMilheiro ?? 0;
    ratios[m] = {
      mp: comp.composicao.materiaPrima.itens.map((i) => ({ nome: i.nome, r: i.valorMilheiro / tot })),
      emb: comp.composicao.embalagem.itens.map((i) => ({ nome: i.nome, r: i.valorMilheiro / tot })),
      mpTot: comp.composicao.materiaPrima.total / tot,
      embTot: comp.composicao.embalagem.total / tot,
      mod: comp.composicao.mod.total / tot,
      ggf: (comp.composicao.cif.total - depr) / tot,
      depr: depr / tot,
    };
  }
  // Fallback: meses com CPV mas sem composição usam o ratio do mês válido mais próximo.
  const ultimoValido = () => { for (let m = 11; m >= 0; m--) if (ratios[m]) return ratios[m]!; return null; };
  const fallback = ultimoValido();
  for (let m = 0; m < 12; m++) if (!ratios[m] && Math.abs(cpvMes[m]) >= 0.005) ratios[m] = fallback ?? ratioVazio;

  // Agrega os sub-itens de MP/Embalagem por nome ao longo do ano.
  const mpItens = new Map<string, number[]>();
  const embItens = new Map<string, number[]>();
  const secMp = z12(), secEmb = z12(), secMod = z12(), secGgf = z12(), secDepr = z12(), naoClass = z12();
  for (let m = 0; m < 12; m++) {
    const cpv = cpvMes[m];
    if (Math.abs(cpv) < 0.005) continue;
    const ra = ratios[m];
    if (!ra) { naoClass[m] += cpv; continue; }
    for (const it of ra.mp) { if (!mpItens.has(it.nome)) mpItens.set(it.nome, z12()); mpItens.get(it.nome)![m] += r2(cpv * it.r); }
    for (const it of ra.emb) { if (!embItens.has(it.nome)) embItens.set(it.nome, z12()); embItens.get(it.nome)![m] += r2(cpv * it.r); }
    secMp[m] += r2(cpv * ra.mpTot);
    secEmb[m] += r2(cpv * ra.embTot);
    secMod[m] += r2(cpv * ra.mod);
    secGgf[m] += r2(cpv * ra.ggf);
    secDepr[m] += r2(cpv * ra.depr);
  }
  const somaTot = (a: number[]) => r2(a.reduce((s, v) => s + v, 0));
  const itensDe = (m: Map<string, number[]>): Item[] =>
    Array.from(m.entries()).map(([nome, meses]) => ({ nome, meses: meses.map(r2), total: somaTot(meses) }))
      .filter((i) => Math.abs(i.total) >= 0.005).sort((a, b) => b.total - a.total);

  const secoes: Secao[] = [
    { chave: "MATERIA_PRIMA", nome: "Matéria-Prima", meses: secMp.map(r2), total: somaTot(secMp), itens: itensDe(mpItens) },
    { chave: "EMBALAGEM", nome: "Embalagens", meses: secEmb.map(r2), total: somaTot(secEmb), itens: itensDe(embItens) },
    { chave: "MOD", nome: "Mão-de-obra", meses: secMod.map(r2), total: somaTot(secMod) },
    { chave: "GGF", nome: "Gastos Gerais de Fabricação", meses: secGgf.map(r2), total: somaTot(secGgf) },
    { chave: "DEPRECIACAO", nome: "Depreciação e Amortização", meses: secDepr.map(r2), total: somaTot(secDepr) },
  ];
  if (somaTot(naoClass) >= 0.005) secoes.push({ chave: "NAO_CLASSIFICADO", nome: "Não classificado", meses: naoClass.map(r2), total: somaTot(naoClass) });

  const totalMeses = cpvMes.map(r2);
  const totalTotal = somaTot(cpvMes);
  const totalAnterior = somaTot(cpvMesAnterior);
  const variacao = Math.abs(totalAnterior) > 0.005 ? r2(((totalTotal - totalAnterior) / Math.abs(totalAnterior)) * 100) : null;

  return NextResponse.json({ ano, secoes, totalMeses, totalTotal, totalAnterior: r2(totalAnterior), variacao });
}
