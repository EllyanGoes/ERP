export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { decimalToNumber } from "@/lib/utils";

function parseDate(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(value);
  return isNaN(d.getTime()) ? fallback : d;
}

// GET /api/contabilidade/dre?from=YYYY-MM-DD&to=YYYY-MM-DD
// DRE da empresa ativa: Receitas (3.1) − Custos (3.2) − Despesas (3.3) =
// Resultado, com quebra por conta (natureza) no período.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const hoje = new Date();
  const defFrom = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const from = parseDate(searchParams.get("from"), defFrom);
  const to = parseDate(searchParams.get("to"), hoje);
  from.setUTCHours(0, 0, 0, 0);
  to.setUTCHours(23, 59, 59, 999);

  const contas = await prisma.contaContabil.findMany({
    where: { grupo: "RESULTADO", tipo: "ANALITICA" },
    select: { id: true, codigo: true, nome: true, natureza: true },
  });
  const ids = contas.map((c) => c.id);

  const periodo = ids.length
    ? await prisma.partidaContabil.groupBy({
        by: ["contaId", "tipo"],
        where: { contaId: { in: ids }, lancamento: { data: { gte: from, lte: to } } },
        _sum: { valor: true },
      })
    : [];

  const deb = new Map<string, number>();
  const cred = new Map<string, number>();
  for (const p of periodo) {
    const m = p.tipo === "DEBITO" ? deb : cred;
    m.set(p.contaId, (m.get(p.contaId) ?? 0) + decimalToNumber(p._sum.valor));
  }

  type Item = { codigo: string; nome: string; valor: number };
  const receitas: Item[] = [], custos: Item[] = [], despesas: Item[] = [];
  for (const c of contas) {
    const d = deb.get(c.id) ?? 0, cr = cred.get(c.id) ?? 0;
    // Receita (credora): crédito − débito. Custo/despesa (devedora): débito − crédito.
    const valor = c.natureza === "CREDORA" ? cr - d : d - cr;
    if (Math.abs(valor) < 0.005) continue;
    const item = { codigo: c.codigo, nome: c.nome, valor };
    if (c.codigo.startsWith("3.1")) receitas.push(item);
    else if (c.codigo.startsWith("3.2")) custos.push(item);
    else despesas.push(item);
  }
  const soma = (a: Item[]) => a.reduce((s, i) => s + i.valor, 0);
  const sortC = (a: Item[]) => a.sort((x, y) => x.codigo.localeCompare(y.codigo, undefined, { numeric: true }));
  sortC(receitas); sortC(custos); sortC(despesas);

  const totalReceitas = soma(receitas), totalCustos = soma(custos), totalDespesas = soma(despesas);
  const resultado = totalReceitas - totalCustos - totalDespesas;

  return NextResponse.json({
    receitas, custos, despesas,
    totalReceitas, totalCustos, totalDespesas, resultado,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  });
}
