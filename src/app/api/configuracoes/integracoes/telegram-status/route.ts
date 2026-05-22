export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const records = await prisma.configuracao.findMany({
      where: { chave: { in: ["tg_bot_token", "tg_chat_id"] } },
    });

    const token  = records.find((r) => r.chave === "tg_bot_token")?.valor;
    const chatId = records.find((r) => r.chave === "tg_chat_id")?.valor;

    if (!token || !chatId) {
      return NextResponse.json({ connected: false, reason: "Bot token e Chat ID não configurados" });
    }

    // Verify bot is valid via getMe
    const getMeRes = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(8000),
    });

    if (!getMeRes.ok) {
      const err = await getMeRes.json().catch(() => ({})) as { description?: string };
      return NextResponse.json({ connected: false, reason: err.description ?? "Token inválido" });
    }

    const getMeData = await getMeRes.json() as { ok: boolean; result?: { username?: string; first_name?: string } };
    const botName = getMeData.result?.first_name ?? getMeData.result?.username ?? "Bot";

    // Send a test message to confirm chat access
    const msgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `✅ *Conexão ERP confirmada*\n\nEste canal está vinculado ao ERP para receber notificações.`,
        parse_mode: "Markdown",
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!msgRes.ok) {
      const err = await msgRes.json().catch(() => ({})) as { description?: string };
      return NextResponse.json({
        connected: false,
        reason: err.description ?? "Não foi possível enviar mensagem para o chat",
      });
    }

    return NextResponse.json({ connected: true, reason: `Bot: @${getMeData.result?.username ?? botName}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ connected: false, reason: msg });
  }
}
