export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bancoSchema } from "@/lib/validations/financeiro";

export async function GET() {
  const data = await prisma.banco.findMany({ orderBy: { nome: "asc" } });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = bancoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });

  const banco = await prisma.banco.create({
    data: {
      codigo: parsed.data.codigo || null,
      nome: parsed.data.nome,
      ativo: parsed.data.ativo,
    },
  });
  return NextResponse.json({ data: banco }, { status: 201 });
}
