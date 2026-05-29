export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clienteSchema } from "@/lib/validations/cliente";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const cliente = await prisma.cliente.findUnique({
    where: { id: params.id },
    include: {
      pedidosVenda: { orderBy: { createdAt: "desc" }, take: 10 },
      contasReceber: { orderBy: { dataVencimento: "asc" }, take: 10 },
    },
  });
  if (!cliente) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  return NextResponse.json({ data: cliente });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const parsed = clienteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = { ...parsed.data, cpfCnpj: parsed.data.cpfCnpj?.trim() || null };
  const cliente = await prisma.cliente.update({ where: { id: params.id }, data });
  return NextResponse.json({ data: cliente });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await prisma.cliente.update({ where: { id: params.id }, data: { status: "INATIVO" } });
  return NextResponse.json({ data: { ok: true } });
}
