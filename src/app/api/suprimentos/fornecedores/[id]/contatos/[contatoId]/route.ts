export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; contatoId: string } }
) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = await req.json();

  // If setting as principal, unset others first
  if (body.principal) {
    await prisma.fornecedorContato.updateMany({
      where: { fornecedorId: params.id },
      data: { principal: false },
    });
  }

  const contato = await prisma.fornecedorContato.update({
    where: { id: params.contatoId, fornecedorId: params.id },
    data: {
      ...(body.nome !== undefined && { nome: body.nome }),
      ...(body.cargo !== undefined && { cargo: body.cargo || null }),
      ...(body.telefone !== undefined && { telefone: body.telefone || null }),
      ...(body.ramal !== undefined && { ramal: body.ramal || null }),
      ...(body.email !== undefined && { email: body.email || null }),
      ...(body.principal !== undefined && { principal: body.principal }),
    },
  });

  return NextResponse.json(contato);
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: { id: string; contatoId: string } }
) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  await prisma.fornecedorContato.delete({
    where: { id: params.contatoId, fornecedorId: params.id },
  });
  return NextResponse.json({ ok: true });
}
