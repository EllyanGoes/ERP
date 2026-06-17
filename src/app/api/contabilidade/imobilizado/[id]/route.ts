export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  const bem = await prisma.imobilizado.findUnique({
    where: { id: params.id },
    include: { depreciacoes: { orderBy: { competencia: "asc" } } },
  });
  if (!bem) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json({ data: bem });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.descricao !== undefined) data.descricao = String(body.descricao);
  if (body.observacoes !== undefined) data.observacoes = body.observacoes?.trim() || null;
  if (body.valorResidual !== undefined) data.valorResidual = Number(body.valorResidual);
  if (body.vidaUtilMeses !== undefined) data.vidaUtilMeses = parseInt(String(body.vidaUtilMeses), 10);
  if (body.status !== undefined && (body.status === "ATIVO" || body.status === "BAIXADO")) data.status = body.status;

  const bem = await prisma.imobilizado.update({ where: { id: params.id }, data });
  return NextResponse.json({ data: bem });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  await prisma.imobilizado.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
