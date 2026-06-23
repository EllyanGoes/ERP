export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { concorrentePrecoSchema } from "@/lib/validations/concorrente";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; precoId: string } },
) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = concorrentePrecoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  let produtoNome = d.produtoNome.trim();
  if (d.itemId) {
    const item = await prisma.item.findUnique({ where: { id: d.itemId }, select: { descricao: true } });
    if (item) produtoNome = item.descricao;
  }

  const preco = await prisma.concorrentePreco.update({
    where: { id: params.precoId },
    data: {
      itemId: d.itemId || null,
      produtoNome,
      preco: d.preco,
      unidade: d.unidade || null,
      dataColeta: d.dataColeta ? new Date(d.dataColeta) : undefined,
      observacao: d.observacao || null,
    },
    include: { item: { select: { id: true, codigo: true, descricao: true, precoVenda: true } } },
  });

  return NextResponse.json({ data: preco });
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: { id: string; precoId: string } },
) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  await prisma.concorrentePreco.delete({ where: { id: params.precoId } });
  return NextResponse.json({ data: { ok: true } });
}
