export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MANAGED_KEYS = [
  "wa_provider",
  "wa_meta_phone_id",
  "wa_meta_access_token",
  "wa_meta_webhook_token",
  "wa_zapi_instance_id",
  "wa_zapi_token",
  "wa_zapi_security_token",
] as const;

export async function GET() {
  try {
    const records = await prisma.configuracao.findMany({
      where: { chave: { in: [...MANAGED_KEYS] } },
    });

    const result: Record<string, string | null> = {};
    for (const key of MANAGED_KEYS) {
      result[key] = records.find((r) => r.chave === key)?.valor ?? null;
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[GET /api/configuracoes/integracoes]", err);
    return NextResponse.json({ error: "Erro ao carregar integrações" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, string | null>;

    await prisma.$transaction(
      Object.entries(body)
        .filter(([key]) => (MANAGED_KEYS as readonly string[]).includes(key))
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
