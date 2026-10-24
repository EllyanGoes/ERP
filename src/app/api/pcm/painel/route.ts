export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { painelManutencao } from "@/lib/manutencao/indicadores";

// GET /api/pcm/painel — indicadores do painel da Manutenção (empresa ativa).
export async function GET() {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  return NextResponse.json({ data: await painelManutencao() });
}
