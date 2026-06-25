export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { apropriarCifAoPep } from "@/lib/contabilidade";

// POST /api/contabilidade/apropriar-cif { periodo?: "YYYY-MM" }
// Apropria o saldo acumulado em "CIF a Apropriar" (1.1.4.0001) ao PEP-CIF
// (1.1.3.0005.0003, estágio QUEIMADO), zerando a conta de staging. Re-rodar é
// no-op (saldo já zerado). Custo REAL — sem taxa predeterminada.
export async function POST(req: Request) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const periodo = typeof body.periodo === "string" ? body.periodo : undefined;
  try {
    const r = await apropriarCifAoPep({ empresaId: EMPRESA_PADRAO_ID, data: new Date(), periodo });
    return NextResponse.json({ data: r });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
