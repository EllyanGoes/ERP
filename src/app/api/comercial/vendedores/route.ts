export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ativo = searchParams.get("ativo");

  const vendedores = await prisma.vendedor.findMany({
    where: ativo !== null ? { ativo: ativo === "true" } : {},
    orderBy: { nome: "asc" },
    include: { usuario: { select: { id: true, nome: true } } },
  });
  return NextResponse.json(vendedores);
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const { nome, telefone, usuarioId } = body;
  if (!nome?.trim()) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }
  try {
    const vendedor = await prisma.vendedor.create({
      data: { nome: nome.trim(), telefone: telefone || null, usuarioId: usuarioId || null },
    });
    return NextResponse.json(vendedor, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("P2002")) return NextResponse.json({ error: "Este usuário já está vinculado a outro vendedor." }, { status: 409 });
    throw err;
  }
}
