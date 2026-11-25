export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Preferências de interface da conta (tema, barra de módulos). Mescla o que
// vier no corpo com o que já está salvo.
const TEMAS = ["light", "dark", "system"];

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const novas: Record<string, unknown> = {};
  if (typeof body.tema === "string" && TEMAS.includes(body.tema)) novas.tema = body.tema;
  if (typeof body.barraModulos === "boolean") novas.barraModulos = body.barraModulos;
  if (Object.keys(novas).length === 0) return NextResponse.json({ error: "Nada para salvar" }, { status: 400 });

  const atual = await prisma.usuario.findUnique({ where: { id: session.sub }, select: { preferencias: true } });
  const preferencias = { ...((atual?.preferencias as Record<string, unknown> | null) ?? {}), ...novas };
  await prisma.usuario.update({ where: { id: session.sub }, data: { preferencias: preferencias as Prisma.InputJsonValue } });
  return NextResponse.json({ data: preferencias });
}
