export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { buildRelatorioNecessidades } from "@/lib/relatorio-necessidades";
import { sendTelegramDocument } from "@/lib/telegram";

/**
 * GET /api/cron/relatorio-necessidades
 *
 * Chamado pelo Vercel Cron (ver vercel.json) — todos os dias às 08:00 BRT.
 * Gera o PDF de Necessidades Pendentes de Cotação e envia ao Telegram.
 *
 * Também pode ser acionado manualmente com o header correto:
 *   Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const relatorio = await buildRelatorioNecessidades();

    const dateStr = new Date().toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit", month: "2-digit", year: "numeric",
    }).replace(/\//g, "-");

    const res = await sendTelegramDocument({
      configKey: "tg_chat_id",       // canal padrão configurado
      filename:  `necessidades-pendentes-${dateStr}.pdf`,
      buffer:    relatorio.pdfBuffer,
      caption:   relatorio.captionText,
    });

    if (!res.ok) {
      console.error("[cron/relatorio-necessidades] Falha ao enviar:", res.error);
      return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      totalSCs: relatorio.totalSCs,
      totalItens: relatorio.totalItens,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/relatorio-necessidades]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
