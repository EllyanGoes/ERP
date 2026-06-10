export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ativo = searchParams.get("ativo");

  const motoristas = await prisma.motorista.findMany({
    where: ativo !== null ? { ativo: ativo === "true" } : {},
    orderBy: { nome: "asc" },
  });
  return NextResponse.json(motoristas);
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const { nome, cpf, cnh, telefone } = body;
  if (!nome?.trim()) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }
  const motorista = await prisma.motorista.create({
    data: { nome: nome.trim(), cpf: cpf || null, cnh: cnh || null, telefone: telefone || null },
  });
  return NextResponse.json(motorista, { status: 201 });
}
