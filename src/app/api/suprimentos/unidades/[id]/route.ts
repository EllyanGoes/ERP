export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({ nome: z.string().min(1).optional(), sigla: z.string().min(1).max(10).optional(), ativo: z.boolean().optional() });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  const data = { ...body.data, ...(body.data.sigla ? { sigla: body.data.sigla.toUpperCase() } : {}) };
  const record = await prisma.unidade.update({ where: { id: params.id }, data });
  return NextResponse.json(record);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await prisma.unidade.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
