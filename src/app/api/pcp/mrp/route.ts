export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { calcularMrp } from "@/lib/pcp/mrp";

// GET — roda a explosão de necessidades (MRP) a partir do MPS + Engenharia (BOM)
export async function GET(req: NextRequest) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const periodo = req.nextUrl.searchParams.get("periodo") || undefined;
  const resultado = await calcularMrp(periodo);
  return NextResponse.json({ data: resultado, source: "db" });
}
