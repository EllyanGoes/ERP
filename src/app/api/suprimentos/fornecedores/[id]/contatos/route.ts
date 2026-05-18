export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const contatos = await prisma.fornecedorContato.findMany({
    where: { fornecedorId: params.id },
    orderBy: [{ principal: "desc" }, { nome: "asc" }],
  });
  return NextResponse.json(contatos);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();

  if (!body.nome?.trim()) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }

  const forn = await prisma.fornecedor.findUnique({ where: { id: params.id } });
  if (!forn) return NextResponse.json({ error: "Fornecedor não encontrado" }, { status: 404 });

  // If this contact is principal, unset others
  if (body.principal) {
    await prisma.fornecedorContato.updateMany({
      where: { fornecedorId: params.id },
      data: { principal: false },
    });
  }

  const contato = await prisma.fornecedorContato.create({
    data: {
      fornecedorId: params.id,
      nome: body.nome.trim(),
      cargo: body.cargo?.trim() || null,
      telefone: body.telefone?.trim() || null,
      ramal: body.ramal?.trim() || null,
      email: body.email?.trim() || null,
      principal: body.principal ?? false,
    },
  });

  return NextResponse.json(contato, { status: 201 });
}
