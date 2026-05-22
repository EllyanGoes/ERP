export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { buildRelatorioEstoque } from "@/lib/relatorio-estoque";
import { sendTelegramChannel } from "@/lib/telegram";

/**
 * GET /api/cron/relatorio-estoque
 *
 * Chamado automaticamente pelo Vercel Cron (ver vercel.json).
 * Gera o relatório do dia e envia ao Canal Estoque no Telegram.
 *
 * Protegido por CRON_SECRET para evitar chamadas externas.
 */
export async function GET(req: NextRequest) {
  // Verificar autorização (Vercel envia o header Authorization: Bearer <CRON_SECRET>)
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const relatorio = await buildRelatorioEstoque(new Date());

    // Enviar ao canal de estoque (tg_chat_estoque)
    const res = await sendTelegramChannel("tg_chat_estoque", { text: relatorio.text });

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
