export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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
  try {
    const cliente = await prisma.cliente.update({ where: { id: params.id }, data });
    return NextResponse.json({ data: cliente });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      (err.meta?.target as string[] | undefined)?.includes("cpfCnpj")
    ) {
      return NextResponse.json(
        { error: "Já existe um cliente cadastrado com este CPF/CNPJ." },
        { status: 409 },
      );
    }
    throw err;
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await prisma.cliente.update({ where: { id: params.id }, data: { status: "INATIVO" } });
  return NextResponse.json({ data: { ok: true } });
}
