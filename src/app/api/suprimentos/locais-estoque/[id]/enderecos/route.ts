export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

type Ctx = { params: { id: string } };

// GET — list addresses for a local
export async function GET(_req: NextRequest, { params }: Ctx) {
  const enderecos = await prisma.enderecoEstoque.findMany({
    where: { localEstoqueId: params.id },
    orderBy: [{ ativo: "desc" }, { codigo: "asc" }],
  });
  return NextResponse.json(enderecos);
}

const postSchema = z.object({
  codigo:    z.string().min(1),
  descricao: z.string().optional().nullable(),
  ativo:     z.boolean().optional(),
});

// POST — create address
export async function POST(req: NextRequest, { params }: Ctx) {
  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  try {
    const created = await prisma.enderecoEstoque.create({
      data: {
        localEstoqueId: params.id,
        codigo:    parsed.data.codigo.trim().toUpperCase(),
        descricao: parsed.data.descricao ?? null,
        ativo:     parsed.data.ativo ?? true,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    if (msg.includes("Unique constraint"))
      return NextResponse.json({ error: "Já existe um endereço com esse código neste local." }, { status: 409 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
