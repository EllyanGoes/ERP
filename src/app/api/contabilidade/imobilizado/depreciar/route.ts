export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { empresasDoEscopo } from "@/lib/prisma";
import { processarDepreciacaoEmpresa } from "@/lib/contabilidade";

// POST /api/contabilidade/imobilizado/depreciar?competencia=YYYY-MM
// Processa a depreciação linear do mês para todos os bens ATIVO da empresa ativa.
// Idempotente: rodar o mesmo mês duas vezes não duplica.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const comp = searchParams.get("competencia"); // "YYYY-MM"
  const now = new Date();
  const ano = comp ? parseInt(comp.slice(0, 4), 10) : now.getUTCFullYear();
  const mes = comp ? parseInt(comp.slice(5, 7), 10) - 1 : now.getUTCMonth();
  if (Number.isNaN(ano) || Number.isNaN(mes) || mes < 0 || mes > 11) {
    return NextResponse.json({ error: "Competência inválida (use YYYY-MM)" }, { status: 400 });
  }
  const competencia = new Date(Date.UTC(ano, mes, 1));

  const empresas = await empresasDoEscopo();
  let processados = 0;
  let total = 0;
  let bens = 0;
  for (const empresaId of empresas) {
    const r = await processarDepreciacaoEmpresa(empresaId, competencia);
    processados += r.processados; total += r.total; bens += r.bens;
  }

  return NextResponse.json({ ok: true, competencia: competencia.toISOString().slice(0, 7), processados, total, bens });
}
