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

// GET /api/contabilidade/balancete?from=YYYY-MM-DD&to=YYYY-MM-DD
// Balancete de verificação da empresa ativa: por conta, saldo anterior, débitos
// e créditos do período e saldo final. Sintéticas somam as analíticas (por
// prefixo de código). Verifica Σ débitos = Σ créditos no período.
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

  const [contas, antes, periodo] = await Promise.all([
    prisma.contaContabil.findMany({
      select: { id: true, codigo: true, nome: true, grupo: true, natureza: true, tipo: true, paiId: true, nivel: true },
    }),
    prisma.partidaContabil.groupBy({
      by: ["contaId", "tipo"],
      where: { lancamento: { data: { lt: from } } },
      _sum: { valor: true },
    }),
    prisma.partidaContabil.groupBy({
      by: ["contaId", "tipo"],
      where: { lancamento: { data: { gte: from, lte: to } } },
      _sum: { valor: true },
    }),
  ]);

  // Mapas de débito/crédito por conta (folhas que receberam partidas).
  type Mov = { debAntes: number; credAntes: number; deb: number; cred: number };
  const mov = new Map<string, Mov>();
  const get = (id: string) => {
    let m = mov.get(id);
    if (!m) { m = { debAntes: 0, credAntes: 0, deb: 0, cred: 0 }; mov.set(id, m); }
    return m;
  };
  for (const a of antes) {
    const m = get(a.contaId); const v = decimalToNumber(a._sum.valor);
    if (a.tipo === "DEBITO") m.debAntes += v; else m.credAntes += v;
  }
  for (const p of periodo) {
    const m = get(p.contaId); const v = decimalToNumber(p._sum.valor);
    if (p.tipo === "DEBITO") m.deb += v; else m.cred += v;
  }

  // Soma por prefixo de código (sintética = soma das analíticas sob ela).
  function agregaConta(c: (typeof contas)[number]): Mov {
    const acc: Mov = { debAntes: 0, credAntes: 0, deb: 0, cred: 0 };
    for (const c2 of contas) {
      if (c2.codigo === c.codigo || c2.codigo.startsWith(c.codigo + ".")) {
        const m = mov.get(c2.id);
        if (m) { acc.debAntes += m.debAntes; acc.credAntes += m.credAntes; acc.deb += m.deb; acc.cred += m.cred; }
      }
    }
    return acc;
  }

  const linhas = contas.map((c) => {
    const a = agregaConta(c);
    const dev = c.natureza === "DEVEDORA";
    const saldoAnterior = dev ? a.debAntes - a.credAntes : a.credAntes - a.debAntes;
    const saldoFinal = dev ? saldoAnterior + a.deb - a.cred : saldoAnterior + a.cred - a.deb;
    return {
      id: c.id, codigo: c.codigo, nome: c.nome, grupo: c.grupo, natureza: c.natureza, tipo: c.tipo,
      paiId: c.paiId, nivel: c.nivel,
      saldoAnterior, debito: a.deb, credito: a.cred, saldoFinal,
    };
  }).sort((x, y) => x.codigo.localeCompare(y.codigo, undefined, { numeric: true }));

  // Totais do período (só folhas, para Σdéb = Σcréd).
  let totalDeb = 0, totalCred = 0;
  mov.forEach((m) => { totalDeb += m.deb; totalCred += m.cred; });

  return NextResponse.json({
    linhas,
    totalDebito: totalDeb,
    totalCredito: totalCred,
    confere: Math.abs(totalDeb - totalCred) < 0.005,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  });
}
