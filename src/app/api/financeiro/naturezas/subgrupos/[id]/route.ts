export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { z } from "zod";

const GRUPOS = ["RECEITA_OPERACIONAL", "CUSTO_OPERACIONAL", "DESPESA_OPERACIONAL", "INVESTIMENTO", "FINANCIAMENTO"] as const;

const schema = z.object({
  nome: z.string().min(1).optional(),
  grupo: z.enum(GRUPOS).optional(),
  ativo: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });

  const data = await prisma.naturezaSubgrupo.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json({ data });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  // Subgrupo com naturezas vinculadas: inativa em vez de excluir, preservando
  // o vínculo das naturezas existentes.
  const usos = await prisma.naturezaFinanceira.count({ where: { subgrupoId: params.id } });
  if (usos > 0) {
    await prisma.naturezaSubgrupo.update({ where: { id: params.id }, data: { ativo: false } });
    return NextResponse.json({ data: { ok: true, inativada: true } });
  }
  await prisma.naturezaSubgrupo.delete({ where: { id: params.id } });
  return NextResponse.json({ data: { ok: true } });
}
