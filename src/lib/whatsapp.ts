// Provider-agnostic WhatsApp sender
// Meta Cloud API: POST https://graph.facebook.com/v19.0/{META_PHONE_NUMBER_ID}/messages
// Z-API: POST https://api.z-api.io/instances/{ZAPI_INSTANCE_ID}/token/{ZAPI_TOKEN}/send-button-list

export interface WAButton {
  id: string;    // payload returned in webhook
  title: string; // button label (max 20 chars)
}

export interface WAMessage {
  to: string;         // phone number with country code, no + (e.g. "5521999999999")
  body: string;       // message text
  buttons: WAButton[];
}

async function sendMeta(msg: WAMessage): Promise<{ msgId: string }> {
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const token = process.env.META_ACCESS_TOKEN;

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
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;

  if (!instanceId || !token) {
    throw new Error("ZAPI_INSTANCE_ID and ZAPI_TOKEN are required for Z-API provider");
  }

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
      headers: { "Content-Type": "application/json" },
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
  const provider = process.env.WHATSAPP_PROVIDER ?? "meta";
  if (provider === "zapi") return sendZAPI(msg);
  return sendMeta(msg);
}
