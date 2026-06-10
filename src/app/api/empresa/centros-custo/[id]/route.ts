export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  codigo:             z.string().min(1).optional(),
  nome:               z.string().min(1).optional(),
  grupoCentroCustoId: z.string().nullable().optional(),
  ativo:              z.boolean().optional(),
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const record = await prisma.centroCusto.findUnique({
    where: { id: params.id },
    include: { grupoCentroCusto: { select: { id: true, nome: true } } },
  });
  if (!record) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(record);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  try {
    const record = await prisma.centroCusto.update({
      where: { id: params.id },
      data: body.data,
      include: { grupoCentroCusto: { select: { id: true, nome: true } } },
    });
    return NextResponse.json(record);
  } catch {
    return NextResponse.json({ error: "Código já cadastrado por outro centro de custo" }, { status: 409 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  await prisma.centroCusto.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
