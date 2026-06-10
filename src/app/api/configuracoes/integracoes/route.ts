export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const MANAGED_KEYS = [
  "wa_provider",
  // Evolution API
  "wa_evolution_url",
  "wa_evolution_instance",
  "wa_evolution_apikey",
  // Meta Cloud API
  "wa_meta_phone_id",
  "wa_meta_access_token",
  "wa_meta_webhook_token",
  // Z-API
  "wa_zapi_instance_id",
  "wa_zapi_token",
  "wa_zapi_security_token",
  // DB Engeman Slave
  "db_engeman_host",
  "db_engeman_name",
  "db_engeman_user",
  "db_engeman_password",
  // Telegram
  "tg_bot_token",
  "tg_chat_id",
  "tg_chat_id_label",
  "tg_chat_estoque",
  "tg_chat_estoque_label",
  "tg_chat_pedidos",
  "tg_chat_pedidos_label",
] as const;

// Chaves cujo valor nunca sai do servidor. O GET devolve a máscara quando há
// valor salvo; o POST ignora a máscara (mantém o que está no banco) — só
// sobrescreve quando o usuário digita um valor novo ou limpa o campo.
const SECRET_KEYS: readonly string[] = [
  "wa_evolution_apikey",
  "wa_meta_access_token",
  "wa_meta_webhook_token",
  "wa_zapi_token",
  "wa_zapi_security_token",
  "db_engeman_password",
  "tg_bot_token",
];

const SECRET_MASK = "••••••••";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const records = await prisma.configuracao.findMany({
      where: { chave: { in: [...MANAGED_KEYS] } },
    });

    const result: Record<string, string | null> = {};
    for (const key of MANAGED_KEYS) {
      const valor = records.find((r) => r.chave === key)?.valor ?? null;
      result[key] = SECRET_KEYS.includes(key) && valor ? SECRET_MASK : valor;
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[GET /api/configuracoes/integracoes]", err);
    return NextResponse.json({ error: "Erro ao carregar integrações" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json() as Record<string, string | null>;

    await prisma.$transaction(
      Object.entries(body)
        .filter(([key]) => (MANAGED_KEYS as readonly string[]).includes(key))
        .filter(([key, valor]) => !(SECRET_KEYS.includes(key) && valor === SECRET_MASK))
        .map(([key, valor]) =>
          prisma.configuracao.upsert({
            where: { chave: key },
            update: { valor: valor ?? null },
            create: { chave: key, valor: valor ?? null },
          })
        )
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/configuracoes/integracoes]", err);
    return NextResponse.json({ error: "Erro ao salvar integrações" }, { status: 500 });
  }
}
