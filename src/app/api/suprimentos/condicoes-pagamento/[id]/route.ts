export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  nome: z.string().min(1).optional(),
  descricao: z.string().optional(),
  numeroParcelas: z.coerce.number().int().min(1).optional(),
  prazoInicial: z.coerce.number().int().min(0).optional(),
  intervaloParcelas: z.coerce.number().int().min(0).optional(),
  diasParcelas: z.string().optional().nullable(),
  semVencimento: z.boolean().optional(),
  descontoVista: z.coerce.number().min(0).max(100).optional().nullable(),
  ativo: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  const record = await prisma.condicaoPagamento.update({ where: { id: params.id }, data: body.data });
  return NextResponse.json(record);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  await prisma.condicaoPagamento.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
