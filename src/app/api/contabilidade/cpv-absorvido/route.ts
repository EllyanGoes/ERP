export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { getSession } from "@/lib/auth";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { calcularCusteio } from "@/lib/pcp/custeio-cif";

// GET /api/contabilidade/cpv-absorvido?ano=YYYY
// Custo de PRODUÇÃO absorvido por COMPONENTE, mês a mês = composição (taxa
// predeterminada) × volume PRODUZIDO no mês. Reflete o que foi FABRICADO no mês
// (material pela engenharia BOM×CMPM + MOD + CIF reais ÷ volume × volume). NÃO é
// o que foi vendido — para isso ver cpv-detalhado (CPV efetivo do razão 3.2.2).
// Mesmo formato de JSON do cpv-detalhado, para reaproveitar a mesma tabela.

const z12 = () => new Array(12).fill(0) as number[];
const r2 = (n: number) => Math.round(n * 100) / 100;

type Item = { nome: string; meses: number[]; total: number };
type Secao = { chave: string; nome: string; meses: number[]; total: number; itens?: Item[] };

export async function GET(req: NextRequest) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;
  const session = await getSession();
  const empresaId = session?.activeEmpresaId ?? EMPRESA_PADRAO_ID;

  const { searchParams } = new URL(req.url);
  const ano = parseInt(searchParams.get("ano") ?? "", 10) || new Date().getUTCFullYear();

  const mpItens = new Map<string, number[]>();
  const embItens = new Map<string, number[]>();
  const modItens = new Map<string, number[]>();
  const ggfItens = new Map<string, number[]>();
  const secMp = z12(), secEmb = z12(), secMod = z12(), secGgf = z12(), secDepr = z12();
  const totalMeses = z12();

  const add = (map: Map<string, number[]>, nome: string, m: number, v: number) => {
    if (!map.has(nome)) map.set(nome, z12());
    map.get(nome)![m] += r2(v);
  };

  for (let m = 0; m < 12; m++) {
    const comp = await calcularCusteio(empresaId, new Date(Date.UTC(ano, m, 1)), { volumeDoMes: true });
    const vol = comp.volumeTotalMilheiros;
    if (vol <= 0) continue; // sem produção no mês
    const c = comp.composicao;
    for (const it of c.materiaPrima.itens) add(mpItens, it.nome, m, it.valorMilheiro * vol);
    for (const it of c.embalagem.itens) add(embItens, it.nome, m, it.valorMilheiro * vol);
    for (const it of c.mod.itens) add(modItens, it.nome, m, it.valorMilheiro * vol);
    // CIF = Gastos Gerais (biomassa/energia/combustível/MOI) + Depreciação (linha à parte).
    for (const it of c.cif.itens) {
      const v = it.valorMilheiro * vol;
      if (/deprecia/i.test(it.nome)) secDepr[m] += r2(v);
      else add(ggfItens, it.nome, m, v);
    }
    const deprMi = c.cif.itens.filter((i) => /deprecia/i.test(i.nome)).reduce((s, i) => s + i.valorMilheiro, 0);
    secMp[m]  += r2(c.materiaPrima.total * vol);
    secEmb[m] += r2(c.embalagem.total * vol);
    secMod[m] += r2(c.mod.total * vol);
    secGgf[m] += r2((c.cif.total - deprMi) * vol);
    totalMeses[m] += r2(c.custoTotalMilheiro * vol);
  }

  const somaTot = (a: number[]) => r2(a.reduce((s, v) => s + v, 0));
  const itensDe = (m: Map<string, number[]>): Item[] =>
    Array.from(m.entries()).map(([nome, meses]) => ({ nome, meses: meses.map(r2), total: somaTot(meses) }))
      .filter((i) => Math.abs(i.total) >= 0.005).sort((a, b) => b.total - a.total);

  const secoes: Secao[] = [
    { chave: "MATERIA_PRIMA", nome: "Matéria-Prima", meses: secMp.map(r2), total: somaTot(secMp), itens: itensDe(mpItens) },
    { chave: "EMBALAGEM", nome: "Embalagens", meses: secEmb.map(r2), total: somaTot(secEmb), itens: itensDe(embItens) },
    { chave: "MOD", nome: "Mão-de-obra", meses: secMod.map(r2), total: somaTot(secMod), itens: itensDe(modItens) },
    { chave: "GGF", nome: "Gastos Gerais de Fabricação", meses: secGgf.map(r2), total: somaTot(secGgf), itens: itensDe(ggfItens) },
    { chave: "DEPRECIACAO", nome: "Depreciação e Amortização", meses: secDepr.map(r2), total: somaTot(secDepr) },
  ];

  const totalTotal = somaTot(totalMeses);
  // Sem variação ano-a-ano aqui (evita dobrar as chamadas a calcularCusteio).
  return NextResponse.json({ ano, secoes, totalMeses: totalMeses.map(r2), totalTotal, totalAnterior: 0, variacao: null });
}
