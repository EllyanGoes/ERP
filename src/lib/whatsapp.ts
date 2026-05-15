// Provider-agnostic WhatsApp sender
// Meta Cloud API: POST https://graph.facebook.com/v19.0/{META_PHONE_NUMBER_ID}/messages
// Z-API: POST https://api.z-api.io/instances/{ZAPI_INSTANCE_ID}/token/{ZAPI_TOKEN}/send-button-list

import { prisma } from "@/lib/prisma";

export interface WAButton {
  id: string;    // payload returned in webhook
  title: string; // button label (max 20 chars)
}

export interface WAMessage {
  to: string;         // phone number with country code, no + (e.g. "5521999999999")
  body: string;       // message text
  buttons: WAButton[];
}

async function getConfig(key: string, envFallback: string | undefined): Promise<string | undefined> {
  try {
    const rec = await prisma.configuracao.findUnique({ where: { chave: key } });
    return rec?.valor ?? envFallback;
  } catch {
    return envFallback;
  }
}

async function sendMeta(msg: WAMessage): Promise<{ msgId: string }> {
  const phoneNumberId = await getConfig("wa_meta_phone_id", process.env.META_PHONE_NUMBER_ID);
  const token         = await getConfig("wa_meta_access_token", process.env.META_ACCESS_TOKEN);

  if (!phoneNumberId || !token) {
    throw new Error("META_PHONE_NUMBER_ID and META_ACCESS_TOKEN are required for Meta provider");
  }

  // Meta interactive messages support max 3 buttons
  const buttons = msg.buttons.slice(0, 3).map((b) => ({
    type: "reply",
    reply: {
      id: b.id,
      title: b.title.slice(0, 20),
    },
  }));

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: msg.to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: msg.body },
      action: { buttons },
    },
  };

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Meta API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const msgId: string = data?.messages?.[0]?.id ?? "";
  return { msgId };
}

async function sendZAPI(msg: WAMessage): Promise<{ msgId: string }> {
  const instanceId      = await getConfig("wa_zapi_instance_id", process.env.ZAPI_INSTANCE_ID);
  const token           = await getConfig("wa_zapi_token", process.env.ZAPI_TOKEN);
  const securityToken   = await getConfig("wa_zapi_security_token", process.env.ZAPI_SECURITY_TOKEN);

  if (!instanceId || !token) {
    throw new Error("ZAPI_INSTANCE_ID and ZAPI_TOKEN are required for Z-API provider");
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (securityToken) headers["Client-Token"] = securityToken;

  const payload = {
    phone: msg.to,
    message: msg.body,
    buttonList: {
      buttons: msg.buttons.map((b) => ({
        id: b.id,
        label: b.title.slice(0, 20),
      })),
    },
  };

  const res = await fetch(
    `https://api.z-api.io/instances/${instanceId}/token/${token}/send-button-list`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Z-API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const msgId: string = data?.zaapId ?? data?.messageId ?? "";
  return { msgId };
}

export async function sendWAMessage(msg: WAMessage): Promise<{ msgId: string }> {
  const provider = await getConfig("wa_provider", process.env.WHATSAPP_PROVIDER ?? "meta");
  if (provider === "zapi") return sendZAPI(msg);
  return sendMeta(msg);
}
