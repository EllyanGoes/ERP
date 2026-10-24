export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { sobressalentesAbaixoDoMinimo } from "@/lib/manutencao/sobressalentes";

// GET /api/pcm/sobressalentes — peças dos ativos com saldo do ERP abaixo do mínimo (painel).
export async function GET() {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  return NextResponse.json({ data: await sobressalentesAbaixoDoMinimo() });
}
