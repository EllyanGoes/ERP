export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { decimalToNumber } from "@/lib/utils";
import { dreDexion } from "@/lib/dexion-dre";

import { cascata, z, r2, type SecaoOut } from "@/lib/dexion-dre";

// GET /api/contabilidade/dre?ano=YYYY&fonte=erp|dexion
// DRE da empresa ativa, mês a mês, agrupada pelas seções da estrutura editável
// (DRESecao). Cada conta de resultado tem valor por mês; o subtotal da seção
// soma/subtrai no resultado conforme a operação da seção.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const ano = parseInt(searchParams.get("ano") ?? "", 10) || new Date().getUTCFullYear();
  const ini = new Date(Date.UTC(ano, 0, 1));
  const fim = new Date(Date.UTC(ano, 11, 31, 23, 59, 59, 999));

  const fonte = searchParams.get("fonte") === "dexion" ? "dexion" : "erp";
  if (fonte === "dexion") {
    const secoesDex = await prisma.dRESecao.findMany({ orderBy: { ordem: "asc" }, select: { id: true, nome: true, operacao: true, ordem: true } });
    const empresaId = auth.session.activeEmpresaId ?? "emp_tramontin";
    try {
      const d = await dreDexion(empresaId, ano, secoesDex);
      return NextResponse.json({ ano, fonte, ...d });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao consultar o Dexion" }, { status: 502 });
    }
  }

  const [secoes, contas, sinteticas] = await Promise.all([
    prisma.dRESecao.findMany({ orderBy: { ordem: "asc" }, select: { id: true, nome: true, operacao: true, ordem: true } }),
    prisma.contaContabil.findMany({
      where: { grupo: "RESULTADO", tipo: "ANALITICA", ativo: true },
      select: { id: true, codigo: true, nome: true, natureza: true, dreSecaoId: true, ordemDre: true },
    }),
    // Sintéticas de resultado (ex.: 3.2.1 CMV, 3.2.2 CPV) — rótulo dos subtotais.
    prisma.contaContabil.findMany({
      where: { grupo: "RESULTADO", tipo: "SINTETICA" },
      select: { codigo: true, nome: true },
    }),
  ]);
  const nomeSintetica = new Map(sinteticas.map((s) => [s.codigo, s.nome]));
  // Subgrupo = sintética-pai intermediária (código com >= 3 segmentos, ex. 3.2.1).
  // Contas direto sob o grupo (3.1/3.2/3.3) não têm subgrupo.
  const subgrupoDe = (codigo: string): { codigo: string; nome: string } | null => {
    const pai = codigo.split(".").slice(0, -1).join(".");
    if (pai.split(".").length < 3) return null;
    return { codigo: pai, nome: nomeSintetica.get(pai) ?? pai };
  };
  const contaIds = contas.map((c) => c.id);

  // Partidas do ano, com data (para o mês) — bucketiza em JS (volume pequeno).
  const partidas = contaIds.length
    ? await prisma.partidaContabil.findMany({
        where: { contaId: { in: contaIds }, lancamento: { data: { gte: ini, lte: fim } } },
        select: { contaId: true, tipo: true, valor: true, lancamento: { select: { data: true } } },
      })
    : [];

  // valorPorConta[contaId][mes 0..11] = débito/crédito acumulado
  const deb = new Map<string, number[]>();
  const cred = new Map<string, number[]>();
  for (const p of partidas) {
    const mes = new Date(p.lancamento.data).getUTCMonth();
    const m = p.tipo === "DEBITO" ? deb : cred;
    if (!m.has(p.contaId)) m.set(p.contaId, z());
    m.get(p.contaId)![mes] += decimalToNumber(p.valor);
  }
  // Seção default por prefixo (para contas sem dreSecaoId).
  const secaoPorPrefixo = (codigo: string) => {
    const nomeAlvo = codigo.startsWith("3.1") ? "Receitas" : codigo.startsWith("3.2") ? "Custos" : "Despesas";
    return secoes.find((s) => s.nome === nomeAlvo) ?? secoes.find((s) => s.operacao !== "SUBTOTAL");
  };

  const porSecao = new Map<string, SecaoOut>();
  for (const s of secoes) porSecao.set(s.id, { id: s.id, nome: s.nome, operacao: s.operacao, contas: [], meses: z(), total: 0 });

  for (const c of contas) {
    const d = deb.get(c.id) ?? z();
    const cr = cred.get(c.id) ?? z();
    // valor mensal natureza-ajustado (>=0 = lado normal): receita credora cr-d; custo/despesa devedora d-cr.
    const meses = z();
    let total = 0;
    for (let i = 0; i < 12; i++) {
      const v = r2(c.natureza === "CREDORA" ? cr[i] - d[i] : d[i] - cr[i]);
      meses[i] = v; total += v;
    }
    total = r2(total);
    if (Math.abs(total) < 0.005 && meses.every((v) => Math.abs(v) < 0.005)) continue; // sem movimento → omite
    const secaoId = c.dreSecaoId && porSecao.has(c.dreSecaoId) ? c.dreSecaoId : secaoPorPrefixo(c.codigo)?.id;
    const sec = secaoId ? porSecao.get(secaoId) : undefined;
    if (!sec) continue;
    const sg = subgrupoDe(c.codigo);
    sec.contas.push({ id: c.id, codigo: c.codigo, nome: c.nome, ordemDre: c.ordemDre ?? 0, meses, total, subgrupoCodigo: sg?.codigo ?? null, subgrupoNome: sg?.nome ?? null });
    for (let i = 0; i < 12; i++) sec.meses[i] = r2(sec.meses[i] + meses[i]);
    sec.total = r2(sec.total + total);
  }

  const secoesOut = Array.from(porSecao.values());
  for (const s of secoesOut) s.contas.sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));

  const { resultadoMeses, resultadoTotal } = cascata(secoesOut);
  return NextResponse.json({ ano, fonte, secoes: secoesOut, resultadoMeses, resultadoTotal });
}
