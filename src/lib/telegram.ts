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

// ── sendTelegramDM ────────────────────────────────────────────────────────────

/**
 * Send a message directly to a specific Telegram chat_id.
 * Used for sending approval requests to specific approvers.
 */
export async function sendTelegramDM(
  chatId: string | number,
  msg: TGMessage
): Promise<{ ok: boolean; msgId?: number; error?: string }> {
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
    chat_id:    String(chatId),
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

// ── sendTelegramChannel ───────────────────────────────────────────────────────

/**
 * Send a message to a specific channel by chat ID stored in the DB config.
 * configKey: the DB key that holds the chat_id (e.g. "tg_chat_estoque")
 */
export async function sendTelegramChannel(
  configKey: string,
  msg: TGMessage
): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getTGConfig();
  if (!cfg) return { ok: false, error: "Telegram não configurado" };

  try {
    const rec = await prisma.configuracao.findUnique({ where: { chave: configKey } });
    const chatId = rec?.valor;
    if (!chatId) return { ok: false, error: `Canal ${configKey} não configurado` };

    const result = await sendTelegramDM(chatId, msg);
    return result;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro" };
  }
}

// ── editTelegramMessage ───────────────────────────────────────────────────────

/**
 * Edit a previously sent message (used to update after approval/rejection via webhook)
 */
export async function editTelegramMessage(
  chatId: string | number,
  messageId: number,
  text: string
): Promise<void> {
  const cfg = await getTGConfig();
  if (!cfg) return;

  await fetch(`${TG_BASE}/bot${cfg.token}/editMessageText`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      chat_id:    String(chatId),
      message_id: messageId,
      text,
      parse_mode: "MarkdownV2",
    }),
    signal: AbortSignal.timeout(8_000),
  }).catch(() => { /* ignore */ });
}

// ── answerCallbackQuery ───────────────────────────────────────────────────────

/**
 * Answer a Telegram callback query (removes the loading indicator on the button)
 */
export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  const cfg = await getTGConfig();
  if (!cfg) return;

  await fetch(`${TG_BASE}/bot${cfg.token}/answerCallbackQuery`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ callback_query_id: callbackQueryId, text: text ?? "" }),
    signal:  AbortSignal.timeout(5_000),
  }).catch(() => { /* ignore */ });
}

// ── setTelegramWebhook ────────────────────────────────────────────────────────

/**
 * Register a webhook URL with Telegram
 */
export async function setTelegramWebhook(
  webhookUrl: string,
  secretToken?: string
): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getTGConfig();
  if (!cfg) return { ok: false, error: "Telegram não configurado" };

  const payload: Record<string, unknown> = {
    url: webhookUrl,
    allowed_updates: ["callback_query", "message"],
    drop_pending_updates: true,
  };
  if (secretToken) payload.secret_token = secretToken;

  try {
    const res = await fetch(`${TG_BASE}/bot${cfg.token}/setWebhook`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(10_000),
    });
    const data = await res.json() as { ok: boolean; description?: string };
    return data.ok ? { ok: true } : { ok: false, error: data.description };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro" };
  }
}

// ── getTelegramWebhookInfo ────────────────────────────────────────────────────

/**
 * Get current webhook info
 */
export async function getTelegramWebhookInfo(): Promise<{ url?: string; ok: boolean; error?: string }> {
  const cfg = await getTGConfig();
  if (!cfg) return { ok: false, error: "Telegram não configurado" };

  try {
    const res = await fetch(`${TG_BASE}/bot${cfg.token}/getWebhookInfo`, {
      signal: AbortSignal.timeout(8_000),
    });
    const data = await res.json() as { ok: boolean; result?: { url?: string }; description?: string };
    if (!data.ok) return { ok: false, error: data.description };
    return { ok: true, url: data.result?.url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro" };
  }
}
