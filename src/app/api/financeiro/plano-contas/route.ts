export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { categoriaFinanceiraSchema } from "@/lib/validations/financeiro";

// GET → categorias em árvore (raízes com filhos aninhados)
export async function GET() {
  const todas = await prisma.categoriaFinanceira.findMany({
    orderBy: { nome: "asc" },
    include: { centroCusto: { select: { id: true, nome: true } } },
  });

  type Node = (typeof todas)[number] & { filhos: Node[] };
  const byId = new Map<string, Node>();
  for (const c of todas) byId.set(c.id, { ...c, filhos: [] });
  const raizes: Node[] = [];
  for (const c of todas) {
    const node = byId.get(c.id)!;
    if (c.paiId && byId.has(c.paiId)) byId.get(c.paiId)!.filhos.push(node);
    else raizes.push(node);
  }

  return NextResponse.json({ data: raizes, flat: todas });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = categoriaFinanceiraSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });

  const categoria = await prisma.categoriaFinanceira.create({
    data: {
      nome: parsed.data.nome,
      tipo: parsed.data.tipo,
      paiId: parsed.data.paiId || null,
      centroCustoId: parsed.data.centroCustoId || null,
      ativo: parsed.data.ativo,
    },
  });
  return NextResponse.json({ data: categoria }, { status: 201 });
}
