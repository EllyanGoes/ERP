export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { siteRastreadoSchema } from "@/lib/tracking/sites-schema";

// Sites rastreados (snippet de tracking — Fase 3 do PRD marketing-funis).
// Lista todos (inclusive inativos, que ficam por último): o id do site é a
// chave pública do snippet, então "excluir" é sempre soft-delete.

export async function GET() {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const data = await prisma.siteRastreado.findMany({
    orderBy: [{ ativo: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = siteRastreadoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const site = await prisma.siteRastreado.create({
    data: {
      nome: parsed.data.nome,
      dominios: parsed.data.dominios,
      ativo: parsed.data.ativo ?? true,
    },
  });
  return NextResponse.json({ data: site }, { status: 201 });
}
