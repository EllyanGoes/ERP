export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { absorverConversaoAoEstoque } from "@/lib/contabilidade";

// POST /api/contabilidade/absorver-conversao { competencia: "YYYY-MM" }
// Absorve os pools de conversão PEP-MOD (1.1.3.0005.0002) e PEP-CIF (0003) ao custo
// dos itens produzidos na competência (CMPM + contábil), por rateio ancorado nos
// pools (térmico só seco+queimado; geral+MOD por volume total). Idempotente por mês.
export async function POST(req: Request) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const comp = typeof body.competencia === "string" ? body.competencia : "";
  const m = /^(\d{4})-(\d{2})$/.exec(comp);
  if (!m) return NextResponse.json({ error: "Informe a competência no formato AAAA-MM." }, { status: 400 });
  const competencia = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  try {
    const r = await absorverConversaoAoEstoque({ empresaId: EMPRESA_PADRAO_ID, data: new Date(), competencia });
    return NextResponse.json({ data: r });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
