export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { concorrentePrecoSchema } from "@/lib/validations/concorrente";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  // Garante que o concorrente existe (e está no escopo da empresa).
  const concorrente = await prisma.concorrente.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!concorrente) return NextResponse.json({ error: "Competidor não encontrado" }, { status: 404 });

  const body = await req.json();
  const parsed = concorrentePrecoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  // Quando vinculado a um Item do catálogo, usa a descrição dele como nome.
  let produtoNome = d.produtoNome.trim();
  if (d.itemId) {
    const item = await prisma.item.findUnique({ where: { id: d.itemId }, select: { descricao: true } });
    if (item) produtoNome = item.descricao;
  }

  const preco = await prisma.concorrentePreco.create({
    data: {
      concorrenteId: params.id,
      itemId: d.itemId || null,
      produtoNome,
      preco: d.preco,
      unidade: d.unidade || null,
      condicaoPagamento: d.condicaoPagamento?.trim() || null,
      modalidade: d.modalidade || null,
      dataColeta: d.dataColeta ? new Date(d.dataColeta) : undefined,
      observacao: d.observacao || null,
    },
    include: { item: { select: { id: true, codigo: true, descricao: true, precoVenda: true } } },
  });

  return NextResponse.json({ data: preco }, { status: 201 });
}
