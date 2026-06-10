export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { buildRelatorioEstoque } from "@/lib/relatorio-estoque";
import { sendTelegramDocument } from "@/lib/telegram";

/**
 * GET /api/cron/relatorio-estoque
 *
 * Chamado automaticamente pelo Vercel Cron (ver vercel.json).
 * Gera o relatório do dia em PDF e envia ao Canal Estoque no Telegram.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const relatorio = await buildRelatorioEstoque(new Date());

    const dateStr = new Date().toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit", month: "2-digit", year: "numeric",
    }).replace(/\//g, "-");

    const res = await sendTelegramDocument({
      configKey: "tg_chat_estoque",
      filename:  `estoque-${dateStr}.pdf`,
      buffer:    relatorio.pdfBuffer,
      caption:   relatorio.captionText,
    });

    if (!res.ok) {
      console.error("[cron/relatorio-estoque] Falha ao enviar:", res.error);
      return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      totalMovimentacoes: relatorio.totalMovimentacoes,
      isEmpty: relatorio.isEmpty,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/relatorio-estoque]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
