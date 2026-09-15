export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEXION_KEYS, getDexionConfig, dexionConfigurado } from "@/lib/dexion";
import { guardDexion } from "../_shared";

const MASCARA = "••••••••";

// GET /api/contabilidade/dexion/config — credenciais (senha mascarada).
export async function GET() {
  const g = await guardDexion();
  if (!g.ok) return g.response;
  const c = await getDexionConfig();
  return NextResponse.json({
    data: { host: c.host, port: c.port, database: c.database, user: c.user, password: c.password ? MASCARA : "", configurado: dexionConfigurado(c) },
  });
}

// POST — salva (só ADMIN). Senha com a máscara mantém a gravada.
export async function POST(req: NextRequest) {
  const g = await guardDexion();
  if (!g.ok) return g.response;
  if (g.session.perfil !== "ADMIN") return NextResponse.json({ error: "Apenas administradores alteram a conexão." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const valores: Record<(typeof DEXION_KEYS)[number], string | null> = {
    dexion_host: String(body.host ?? "").trim() || null,
    dexion_port: String(body.port ?? "").trim() || null,
    dexion_database: String(body.database ?? "").trim() || null,
    dexion_user: String(body.user ?? "").trim() || null,
    dexion_password: body.password === MASCARA ? undefined as unknown as null : (String(body.password ?? "").trim() || null),
  };
  for (const chave of DEXION_KEYS) {
    const valor = valores[chave];
    if (valor === undefined) continue; // máscara: mantém
    await prisma.configuracao.upsert({ where: { chave }, update: { valor }, create: { chave, valor } });
  }
  return NextResponse.json({ ok: true });
}
