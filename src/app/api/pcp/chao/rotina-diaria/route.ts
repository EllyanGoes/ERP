export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { gerarOPsDoDia } from "@/lib/pcp/chao";

// POST /api/pcp/chao/rotina-diaria
// Botão da rotina diária: gera todas as OPs do dia conforme o planejado.
// body: { data?: "YYYY-MM-DD" }
export async function POST(req: NextRequest) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const dia = typeof body?.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.data)
    ? body.data
    : new Date().toISOString().slice(0, 10);

  const resultado = await gerarOPsDoDia(dia);
  return NextResponse.json({ data: { ...resultado, data: dia } });
}
