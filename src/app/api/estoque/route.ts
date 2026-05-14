export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const estoques = await prisma.estoqueItem.findMany({
    include: {
      item: {
        select: { id: true, codigo: true, descricao: true, tipo: true, unidadeMedida: true, ativo: true, unidade: { select: { sigla: true } } },
      },
      localEstoque: { select: { id: true, nome: true } },
    },
    orderBy: [{ localEstoque: { nome: "asc" } }, { item: { codigo: "asc" } }],
  });
  return NextResponse.json({ data: estoques });
}
