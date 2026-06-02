export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { enviarRelatorioDiarioPedidosVenda } from "@/lib/notify-pedido-venda";

/**
 * GET /api/cron/relatorio-pedidos-venda
 *
 * Chamado automaticamente pelo Vercel Cron (ver vercel.json) no fim do dia.
 * Envia ao Telegram a quantidade e o total de pedidos de venda do dia.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const r = await enviarRelatorioDiarioPedidosVenda();
    if (!r.ok) {
      console.error("[cron/relatorio-pedidos-venda] Falha ao enviar:", r.error);
      return NextResponse.json({ ok: false, error: r.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, qtd: r.qtd, total: r.total });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/relatorio-pedidos-venda]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
