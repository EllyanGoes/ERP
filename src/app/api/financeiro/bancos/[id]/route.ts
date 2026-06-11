export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const dados: { codigo?: string | null; nome?: string; ativo?: boolean } = {};
  if (body.codigo !== undefined) dados.codigo = body.codigo?.trim() || null;
  if (body.nome !== undefined) {
    if (!body.nome?.trim()) return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
    dados.nome = body.nome.trim();
  }
  if (body.ativo !== undefined) dados.ativo = Boolean(body.ativo);

  try {
    const banco = await prisma.banco.update({ where: { id: params.id }, data: dados });
    return NextResponse.json({ data: banco });
  } catch {
    return NextResponse.json({ error: "Banco não encontrado" }, { status: 404 });
  }
}
