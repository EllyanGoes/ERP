export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  nome: z.string().min(1),
  ativo: z.boolean().optional(),
  // Fonte da verdade do CIF×Despesa dos centros do grupo.
  fabril: z.boolean().optional(),
  descricaoCusteio: z.string().nullable().optional(),
});

export async function GET() {
  const grupos = await prisma.grupoCentroCusto.findMany({
    orderBy: { nome: "asc" },
    include: { _count: { select: { centros: true } } },
  });
  return NextResponse.json(grupos);
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  try {
    const grupo = await prisma.grupoCentroCusto.create({ data: body.data });
    return NextResponse.json(grupo, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Nome já cadastrado" }, { status: 409 });
  }
}
