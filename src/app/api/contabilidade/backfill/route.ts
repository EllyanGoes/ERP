export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { contabilizarTituloReceber, contabilizarTituloPagar } from "@/lib/contabilidade";

// POST /api/contabilidade/backfill
// Gera (idempotente) os lançamentos contábeis retroativos a partir dos títulos
// já existentes — contas a receber (venda + recebimento) e a pagar (compra +
// pagamento). Reusa os mesmos helpers dos hooks ao vivo.
export async function POST() {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  let processados = 0;
  const erros: string[] = [];

  const crs = await prismaSemEscopo.contaReceber.findMany({
    where: { status: { not: "CANCELADA" } },
    select: { id: true, numero: true },
  });
  for (const cr of crs) {
    try { await contabilizarTituloReceber(cr.id); processados++; }
    catch (e) { erros.push(`CR ${cr.numero}: ${(e as Error).message}`); }
  }

  const cps = await prismaSemEscopo.contaPagar.findMany({
    where: { status: { not: "CANCELADA" }, fornecedorId: { not: null } },
    select: { id: true, numero: true },
  });
  for (const cp of cps) {
    try { await contabilizarTituloPagar(cp.id); processados++; }
    catch (e) { erros.push(`CP ${cp.numero}: ${(e as Error).message}`); }
  }

  return NextResponse.json({ ok: true, processados, erros: erros.slice(0, 20) });
}
