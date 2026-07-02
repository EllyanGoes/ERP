export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { enviarResumoPcpDia } from "@/lib/notify-pcp";

/**
 * GET /api/cron/relatorio-pcp
 *
 * Chamado pelo Vercel Cron (ver vercel.json) às 22:00 UTC = 19:00 BRT.
 * Envia o resumo do dia (OPs criadas + apontamentos concluídos + produção) ao
 * grupo do PCP no Telegram.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const r = await enviarResumoPcpDia();
    return NextResponse.json({ ok: true, apontamentos: r.apontamentos });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/relatorio-pcp]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
