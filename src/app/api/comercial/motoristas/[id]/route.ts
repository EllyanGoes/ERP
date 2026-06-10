export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const { nome, cpf, cnh, telefone, ativo } = body;
  if (nome !== undefined && !nome?.trim()) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }
  const motorista = await prisma.motorista.update({
    where: { id: params.id },
    data: {
      ...(nome !== undefined    ? { nome: nome.trim() }    : {}),
      ...(cpf !== undefined     ? { cpf: cpf || null }     : {}),
      ...(cnh !== undefined     ? { cnh: cnh || null }     : {}),
      ...(telefone !== undefined ? { telefone: telefone || null } : {}),
      ...(ativo !== undefined   ? { ativo }                : {}),
    },
  });
  return NextResponse.json(motorista);
}
