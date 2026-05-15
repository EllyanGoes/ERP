// Provider-agnostic WhatsApp sender
// Providers supported:
//   evolution — Evolution API v2 (self-hosted, recommended)
//   meta      — Meta Cloud API (official)
//   zapi      — Z-API (personal/business number automation)

import { prisma } from "@/lib/prisma";

export interface WAButton {
  id: string;    // payload returned in webhook button click
  title: string; // button label (max 20 chars)
}

export interface WAMessage {
  to: string;        // phone with country code, no + (e.g. "5521999999999")
  body: string;      // message text / description
  buttons: WAButton[];
  header?: string;   // bold title shown above body (Evolution / Meta)
  footer?: string;   // small grey text below buttons
}

// ── DB/Env config helper ──────────────────────────────────────────────────────

async function getConfig(key: string, envFallback?: string): Promise<string | undefined> {
  try {
    const rec = await prisma.configuracao.findUnique({ where: { chave: key } });
    return rec?.valor ?? envFallback;
  } catch {
    return envFallback;
  }
}

// ── Exported: validate credentials exist before touching the DB ───────────────

export async function validateWAConfig(): Promise<{ ok: true } | { ok: false; error: string }> {
  const provider = await getConfig("wa_provider", process.env.WHATSAPP_PROVIDER ?? "evolution");

  if (provider === "evolution") {
    const url      = await getConfig("wa_evolution_url",      process.env.EVOLUTION_API_URL);
    const instance = await getConfig("wa_evolution_instance", process.env.EVOLUTION_INSTANCE);
    const apiKey   = await getConfig("wa_evolution_apikey",   process.env.EVOLUTION_API_KEY);
    if (!url || !instance || !apiKey) {
      return { ok: false, error: "Evolution API não configurada. Acesse Configurações → Integrações e preencha a URL, Instância e API Key." };
    }
  } else if (provider === "zapi") {
    const instanceId = await getConfig("wa_zapi_instance_id", process.env.ZAPI_INSTANCE_ID);
    const token      = await getConfig("wa_zapi_token",       process.env.ZAPI_TOKEN);
    if (!instanceId || !token) {
      return { ok: false, error: "Z-API não configurada. Acesse Configurações → Integrações e preencha o Instance ID e Token." };
    }
  } else {
    // meta
    const phoneId = await getConfig("wa_meta_phone_id",     process.env.META_PHONE_NUMBER_ID);
    const token   = await getConfig("wa_meta_access_token", process.env.META_ACCESS_TOKEN);
    if (!phoneId || !token) {
      return { ok: false, error: "WhatsApp (Meta) não configurado. Acesse Configurações → Integrações e preencha o Phone Number ID e o Access Token." };
    }
  }

  return { ok: true };
}

// ── Evolution API v2 ──────────────────────────────────────────────────────────
// POST {serverUrl}/message/sendButtons/{instance}
// Header: apikey: YOUR_API_KEY
// Docs: https://doc.evolution-api.com/v2/pt/messages/send-buttons

async function sendEvolution(msg: WAMessage): Promise<{ msgId: string }> {
  const baseUrl  = await getConfig("wa_evolution_url",      process.env.EVOLUTION_API_URL);
  const instance = await getConfig("wa_evolution_instance", process.env.EVOLUTION_INSTANCE);
  const apiKey   = await getConfig("wa_evolution_apikey",   process.env.EVOLUTION_API_KEY);

  if (!baseUrl || !instance || !apiKey) {
    throw new Error("Evolution API não configurada. Acesse Configurações → Integrações.");
  }

  // Evolution supports up to 3 reply buttons
  const buttons = msg.buttons.slice(0, 3).map((b) => ({
    type:        "reply",
    displayText: b.title.slice(0, 20),
    id:          b.id,
  }));

  const payload = {
    number:      msg.to,
    title:       msg.header ?? "",          // bold header above body
    description: msg.body,                  // main content
    footer:      msg.footer ?? "",
    buttons,
  };

  const url = `${baseUrl.replace(/\/$/, "")}/message/sendButtons/${instance}`;

  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Evolution API error ${res.status}: ${err}`);
  }

  const data  = await res.json();
  const msgId: string = data?.key?.id ?? data?.id ?? "";
  return { msgId };
}

// ── Meta Cloud API ────────────────────────────────────────────────────────────

async function sendMeta(msg: WAMessage): Promise<{ msgId: string }> {
  const phoneNumberId = await getConfig("wa_meta_phone_id",     process.env.META_PHONE_NUMBER_ID);
  const token         = await getConfig("wa_meta_access_token", process.env.META_ACCESS_TOKEN);

  if (!phoneNumberId || !token) {
    throw new Error("WhatsApp (Meta) não configurado. Acesse Configurações → Integrações.");
  }

  const buttons = msg.buttons.slice(0, 3).map((b) => ({
    type: "reply",
    reply: { id: b.id, title: b.title.slice(0, 20) },
  }));

  // Meta body.text hard limit: 1024 chars
  const bodyText = msg.body.length > 1024 ? msg.body.slice(0, 1021) + "…" : msg.body;

  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type:    "individual",
    to:                msg.to,
    type:              "interactive",
    interactive: {
      type: "button",
      ...(msg.header ? { header: { type: "text", text: msg.header.slice(0, 60) } } : {}),
      body:   { text: bodyText },
      ...(msg.footer ? { footer: { text: msg.footer.slice(0, 60) } } : {}),
      action: { buttons },
    },
  };

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Meta API error ${res.status}: ${err}`);
  }

  const data  = await res.json();
  const msgId: string = data?.messages?.[0]?.id ?? "";
  return { msgId };
}

// ── Z-API ─────────────────────────────────────────────────────────────────────
// Uses send-button-list (list message) — webhook fires listResponseMessage

async function sendZAPI(msg: WAMessage): Promise<{ msgId: string }> {
  const instanceId    = await getConfig("wa_zapi_instance_id",    process.env.ZAPI_INSTANCE_ID);
  const token         = await getConfig("wa_zapi_token",          process.env.ZAPI_TOKEN);
  const securityToken = await getConfig("wa_zapi_security_token", process.env.ZAPI_SECURITY_TOKEN);

  if (!instanceId || !token) {
    throw new Error("Z-API não configurada. Acesse Configurações → Integrações.");
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (securityToken) headers["Client-Token"] = securityToken;

  const payload = {
    phone:   msg.to,
    message: msg.body,
    buttonList: {
      button: "Ver opções",
      sections: [
        {
          title: "Ações",
          rows: msg.buttons.map((b) => ({
            id:          b.id,
            title:       b.title.slice(0, 24),
            description: "",
          })),
        },
      ],
    },
  };

  const res = await fetch(
    `https://api.z-api.io/instances/${instanceId}/token/${token}/send-button-list`,
    { method: "POST", headers, body: JSON.stringify(payload) }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Z-API error ${res.status}: ${err}`);
  }

  const data  = await res.json();
  const msgId: string = data?.zaapId ?? data?.messageId ?? "";
  return { msgId };
}

// ── Public entry-point ────────────────────────────────────────────────────────

export async function sendWAMessage(msg: WAMessage): Promise<{ msgId: string }> {
  const provider = await getConfig("wa_provider", process.env.WHATSAPP_PROVIDER ?? "evolution");
  if (provider === "zapi")      return sendZAPI(msg);
  if (provider === "meta")      return sendMeta(msg);
  return sendEvolution(msg);   // default
}
