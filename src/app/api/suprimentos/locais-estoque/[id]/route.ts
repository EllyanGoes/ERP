export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  nome:     z.string().min(1),
  descricao: z.string().optional(),
  ativo:    z.boolean().optional(),
  filialId: z.string().nullable().optional(),
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const record = await prisma.localEstoque.findUnique({
    where: { id: params.id },
    include: {
      filial: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      estoqueItens: {
        include: {
          item: {
            select: {
              id: true, codigo: true, descricao: true,
              tipo: true, ativo: true, unidadeMedida: true, precoCusto: true,
              unidade: { select: { sigla: true } },
            },
          },
        },
        orderBy: { item: { codigo: "asc" } },
      },
    },
  });
  if (!record) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(record);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  const record = await prisma.localEstoque.update({ where: { id: params.id }, data: body.data });
  return NextResponse.json(record);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await prisma.localEstoque.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
