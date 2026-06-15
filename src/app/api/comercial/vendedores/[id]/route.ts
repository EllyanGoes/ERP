export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const { nome, telefone, ativo, usuarioId } = body;
  if (nome !== undefined && !nome?.trim()) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }
  try {
    const vendedor = await prisma.vendedor.update({
      where: { id: params.id },
      data: {
        ...(nome !== undefined      ? { nome: nome.trim() }            : {}),
        ...(telefone !== undefined  ? { telefone: telefone || null }   : {}),
        ...(ativo !== undefined     ? { ativo }                        : {}),
        ...(usuarioId !== undefined ? { usuarioId: usuarioId || null } : {}),
      },
    });
    return NextResponse.json(vendedor);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("P2002")) return NextResponse.json({ error: "Este usuário já está vinculado a outro vendedor." }, { status: 409 });
    throw err;
  }
}
