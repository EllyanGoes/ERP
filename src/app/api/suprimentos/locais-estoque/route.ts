export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  nome:      z.string().min(1),
  descricao: z.string().nullable().optional(),
  filialId:  z.string().min(1, "Filial é obrigatória"),
  ativo:     z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filialId = searchParams.get("filialId");
  const ativo    = searchParams.get("ativo");

  const data = await prisma.localEstoque.findMany({
    where: {
      AND: [
        filialId ? { filialId } : {},
        ativo !== null && ativo !== "" ? { ativo: ativo === "true" } : {},
      ],
    },
    orderBy: { nome: "asc" },
    include: {
      filial: { select: { id: true, razaoSocial: true } },
      _count: { select: { estoqueItens: true } },
      estoqueItens: {
        select: {
          itemId: true,
          quantidadeAtual: true,
          item: { select: { precoCusto: true } },
        },
      },
    },
  });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  const record = await prisma.localEstoque.create({ data: body.data });
  return NextResponse.json(record, { status: 201 });
}
