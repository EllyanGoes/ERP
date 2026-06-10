export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { setTelegramWebhook, getTelegramWebhookInfo } from "@/lib/telegram";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const info = await getTelegramWebhookInfo();
  return NextResponse.json(info);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    // Determine base URL from request
    const proto   = req.headers.get("x-forwarded-proto") ?? "https";
    const host    = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
    const baseUrl = `${proto}://${host}`;

    const webhookUrl = `${baseUrl}/api/webhooks/telegram`;
    const secret     = process.env.TG_WEBHOOK_SECRET;

    const result = await setTelegramWebhook(webhookUrl, secret);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, webhookUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro" },
      { status: 500 }
    );
  }
}
