export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";

export async function GET() {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const [cr, cp] = await Promise.all([
    prisma.contaReceber.findMany({
      where: { status: { notIn: ["CANCELADA"] } },
      select: { dataVencimento: true, valorOriginal: true, valorPago: true, status: true },
      orderBy: { dataVencimento: "asc" },
    }),
    prisma.contaPagar.findMany({
      where: { status: { notIn: ["CANCELADA"] } },
      select: { dataVencimento: true, valorOriginal: true, valorPago: true, status: true },
      orderBy: { dataVencimento: "asc" },
    }),
  ]);

  // Build day-level map
  const map = new Map<string, { receitas: number; despesas: number; recebido: number; pago: number }>();

  for (const c of cr) {
    const key = c.dataVencimento.toISOString().split("T")[0];
    const entry = map.get(key) ?? { receitas: 0, despesas: 0, recebido: 0, pago: 0 };
    entry.receitas += parseFloat(c.valorOriginal.toString());
    entry.recebido += parseFloat(c.valorPago.toString());
    map.set(key, entry);
  }

  for (const c of cp) {
    const key = c.dataVencimento.toISOString().split("T")[0];
    const entry = map.get(key) ?? { receitas: 0, despesas: 0, recebido: 0, pago: 0 };
    entry.despesas += parseFloat(c.valorOriginal.toString());
    entry.pago += parseFloat(c.valorPago.toString());
    map.set(key, entry);
  }

  let saldoAcumulado = 0;
  const result = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, vals]) => {
      saldoAcumulado += vals.receitas - vals.despesas;
      return { data, ...vals, saldo: saldoAcumulado };
    });

  return NextResponse.json({ data: result });
}
