// Telegram Bot API helper
// Sends messages to a configured channel/group via a bot.
// Config keys stored in `Configuracao` table: tg_bot_token, tg_chat_id

import { prisma } from "@/lib/prisma";

const TG_BASE = "https://api.telegram.org";

// ── Config ────────────────────────────────────────────────────────────────────

async function getTGConfig(): Promise<{ token: string; chatId: string } | null> {
  try {
    const records = await prisma.configuracao.findMany({
      where: { chave: { in: ["tg_bot_token", "tg_chat_id"] } },
    });
    const token  = records.find((r) => r.chave === "tg_bot_token")?.valor;
    const chatId = records.find((r) => r.chave === "tg_chat_id")?.valor;
    if (!token || !chatId) return null;
    return { token, chatId };
  } catch {
    return null;
  }
}

// ── Escapes ───────────────────────────────────────────────────────────────────
// MarkdownV2 requires escaping: _ * [ ] ( ) ~ ` > # + - = | { } . !

export function escMD(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

// ── sendTelegramMessage ───────────────────────────────────────────────────────

export interface TGMessage {
  /** MarkdownV2 formatted text */
  text: string;
  /** Inline keyboard buttons (rows of buttons) */
  inlineKeyboard?: { text: string; url?: string; callbackData?: string }[][];
}

export async function sendTelegramMessage(msg: TGMessage): Promise<{ ok: boolean; msgId?: number; error?: string }> {
  const cfg = await getTGConfig();
  if (!cfg) {
    return { ok: false, error: "Telegram não configurado. Acesse Configurações → Integrações." };
  }

  const inline_keyboard = msg.inlineKeyboard?.map((row) =>
    row.map((btn) => {
      if (btn.url)          return { text: btn.text, url: btn.url };
      if (btn.callbackData) return { text: btn.text, callback_data: btn.callbackData };
      return { text: btn.text, callback_data: btn.text };
    })
  );

  const payload: Record<string, unknown> = {
    chat_id:    cfg.chatId,
    text:       msg.text,
    parse_mode: "MarkdownV2",
    ...(inline_keyboard ? { reply_markup: { inline_keyboard } } : {}),
  };

  try {
    const res = await fetch(`${TG_BASE}/bot${cfg.token}/sendMessage`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(10_000),
    });

    const data = await res.json() as { ok: boolean; result?: { message_id?: number }; description?: string };

    if (!data.ok) {
      return { ok: false, error: data.description ?? "Telegram API error" };
    }

    return { ok: true, msgId: data.result?.message_id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro ao enviar para o Telegram" };
  }
}

// ── validateTGConfig ──────────────────────────────────────────────────────────

export async function validateTGConfig(): Promise<{ ok: true } | { ok: false; error: string }> {
  const cfg = await getTGConfig();
  if (!cfg) {
    return { ok: false, error: "Telegram não configurado. Acesse Configurações → Integrações." };
  }
  return { ok: true };
}
