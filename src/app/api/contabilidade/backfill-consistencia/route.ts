export const dynamic = "force-dynamic";
export const maxDuration = 300;
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { executarBackfillConsistencia } from "@/lib/backfill-consistencia";

/**
 * Backfill de consistência contábil/financeira (jul/2026) — roda o MOTOR TS no
 * próprio ambiente (em prod, onde o DATABASE_URL vive). Idempotente; re-rodar
 * não duplica. `?dry=1` só dimensiona, sem escrever. Só ADMIN.
 */
export async function POST(req: NextRequest) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;
  if (auth.session.perfil !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });
  }
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const resultado = await executarBackfillConsistencia({ dry });
  return NextResponse.json({ data: { dry, ...resultado } });
}
