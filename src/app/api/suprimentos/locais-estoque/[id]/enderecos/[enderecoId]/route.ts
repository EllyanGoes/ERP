export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

type Ctx = { params: { id: string; enderecoId: string } };

const patchSchema = z.object({
  codigo:    z.string().min(1).optional(),
  descricao: z.string().optional().nullable(),
  ativo:     z.boolean().optional(),
});

// PATCH — update address
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  try {
    const data: Record<string, unknown> = {};
    if (parsed.data.codigo    !== undefined) data.codigo    = parsed.data.codigo.trim().toUpperCase();
    if (parsed.data.descricao !== undefined) data.descricao = parsed.data.descricao;
    if (parsed.data.ativo     !== undefined) data.ativo     = parsed.data.ativo;

    const updated = await prisma.enderecoEstoque.update({
      where: { id: params.enderecoId },
      data,
    });
    return NextResponse.json(updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    if (msg.includes("Unique constraint"))
      return NextResponse.json({ error: "Já existe um endereço com esse código neste local." }, { status: 409 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE — remove address
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  try {
    await prisma.enderecoEstoque.delete({ where: { id: params.enderecoId } });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
