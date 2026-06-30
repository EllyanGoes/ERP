export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

type Ctx = { params: { id: string; contatoId: string } };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const b = await req.json();
  if (!b.nome?.trim()) return NextResponse.json({ error: "Informe o nome do contato" }, { status: 400 });

  const r = await prisma.concorrenteContato.updateMany({
    where: { id: params.contatoId, concorrenteId: params.id },
    data: {
      nome: b.nome.trim(),
      cargo: b.cargo?.trim() || null,
      telefone: b.telefone?.trim() || null,
      email: b.email?.trim() || null,
      observacao: b.observacao?.trim() || null,
    },
  });
  if (r.count === 0) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });
  const data = await prisma.concorrenteContato.findUnique({ where: { id: params.contatoId } });
  return NextResponse.json({ data });
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;
  await prisma.concorrenteContato.deleteMany({ where: { id: params.contatoId, concorrenteId: params.id } });
  return NextResponse.json({ data: { ok: true } });
}
