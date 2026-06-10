export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getCfg(key: string) {
  const r = await prisma.configuracao.findUnique({ where: { chave: key } });
  return r?.valor ?? null;
}

export async function GET(_req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const provider = (await getCfg("wa_provider")) ?? "evolution";

    if (provider === "zapi") {
      const instanceId    = await getCfg("wa_zapi_instance_id");
      const token         = await getCfg("wa_zapi_token");
      const securityToken = await getCfg("wa_zapi_security_token");

      if (!instanceId || !token) {
        return NextResponse.json({ connected: false, reason: "Credenciais não configuradas" });
      }

      const headers: Record<string, string> = {};
      if (securityToken) headers["Client-Token"] = securityToken;

      const res = await fetch(
        `https://api.z-api.io/instances/${instanceId}/token/${token}/status`,
        { headers, cache: "no-store" }
      );

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return NextResponse.json({
          connected: false,
          reason: `Z-API HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
        });
      }

      const data = await res.json();
      return NextResponse.json({
        connected: !!data?.connected,
        reason: data?.connected ? "Instância conectada" : "Instância desconectada",
        raw: data,
      });
    }

    if (provider === "evolution") {
      const baseUrl  = await getCfg("wa_evolution_url");
      const instance = await getCfg("wa_evolution_instance");
      const apiKey   = await getCfg("wa_evolution_apikey");

      if (!baseUrl || !instance || !apiKey) {
        return NextResponse.json({ connected: false, reason: "Credenciais não configuradas" });
      }

      const res = await fetch(
        `${baseUrl.replace(/\/$/, "")}/instance/fetchInstances`,
        { headers: { apikey: apiKey }, cache: "no-store" }
      );

      if (!res.ok) {
        return NextResponse.json({ connected: false, reason: `Evolution HTTP ${res.status}` });
      }

      const data = await res.json();
      const inst  = Array.isArray(data)
        ? data.find((i: { instance?: { instanceName?: string } }) => i.instance?.instanceName === instance)
        : null;
      const connected = inst?.instance?.state === "open";
      return NextResponse.json({
        connected,
        reason: connected ? "Instância conectada" : (inst ? `Estado: ${inst.instance?.state}` : "Instância não encontrada"),
      });
    }

    if (provider === "meta") {
      const phoneId = await getCfg("wa_meta_phone_id");
      const token   = await getCfg("wa_meta_access_token");

      if (!phoneId || !token) {
        return NextResponse.json({ connected: false, reason: "Credenciais não configuradas" });
      }

      const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return NextResponse.json({
          connected: false,
          reason: (err as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`,
        });
      }

      const data = await res.json() as { display_phone_number?: string };
      return NextResponse.json({
        connected: true,
        reason: data.display_phone_number ? `Número: ${data.display_phone_number}` : "Conectado",
      });
    }

    return NextResponse.json({ connected: false, reason: "Provedor desconhecido" });
  } catch (err) {
    return NextResponse.json({
      connected: false,
      reason: err instanceof Error ? err.message : "Erro interno",
    });
  }
}
