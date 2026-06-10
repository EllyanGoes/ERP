export const dynamic    = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { buildRelatorioConsumo } from "@/lib/relatorio-consumo";
import { sendTelegramDocument } from "@/lib/telegram";

/**
 * GET /api/cron/relatorio-consumo
 * Gera o PDF de Análise de Consumo dos produtos favoritados e envia ao Telegram.
 * Protegido por CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const relatorio = await buildRelatorioConsumo();

    const dateStr = new Date().toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit", month: "2-digit", year: "numeric",
    }).replace(/\//g, "-");

    const res = await sendTelegramDocument({
      configKey: "tg_chat_id",
      filename:  `consumo-${dateStr}.pdf`,
      buffer:    relatorio.pdfBuffer,
      caption:   relatorio.captionText,
    });

    if (!res.ok) {
      console.error("[cron/relatorio-consumo] Falha ao enviar:", res.error);
      return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, totalProdutos: relatorio.totalProdutos });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/relatorio-consumo]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
