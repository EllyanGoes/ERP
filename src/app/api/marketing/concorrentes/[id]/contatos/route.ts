export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const data = await prisma.concorrenteContato.findMany({
    where: { concorrenteId: params.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const b = await req.json();
  if (!b.nome?.trim()) return NextResponse.json({ error: "Informe o nome do contato" }, { status: 400 });

  const contato = await prisma.concorrenteContato.create({
    data: {
      concorrenteId: params.id,
      nome: b.nome.trim(),
      cargo: b.cargo?.trim() || null,
      telefone: b.telefone?.trim() || null,
      email: b.email?.trim() || null,
      observacao: b.observacao?.trim() || null,
    },
  });
  return NextResponse.json({ data: contato }, { status: 201 });
}
