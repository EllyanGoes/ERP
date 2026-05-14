export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const TIPOS = ["DINHEIRO","PIX","TRANSFERENCIA","BOLETO","CARTAO_CREDITO","CARTAO_DEBITO","CHEQUE","OUTROS"] as const;

const schema = z.object({
  nome: z.string().min(1).optional(),
  tipo: z.enum(TIPOS).optional(),
  descricao: z.string().optional(),
  ativo: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  const record = await prisma.formaPagamento.update({ where: { id: params.id }, data: body.data });
  return NextResponse.json(record);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await prisma.formaPagamento.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
