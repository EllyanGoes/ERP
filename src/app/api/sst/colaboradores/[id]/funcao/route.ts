export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";

// PUT /api/sst/colaboradores/[id]/funcao { funcaoId | null, inicio? } — encerra o
// vínculo vigente e abre outro (mudança de função). null = só encerra.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const inicio = b.inicio ? new Date(b.inicio) : new Date();
  const colab = await prismaSemEscopo.colaborador.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!colab) return NextResponse.json({ error: "Colaborador não encontrado" }, { status: 404 });
  await prismaSemEscopo.$transaction(async (tx) => {
    await tx.sstColaboradorFuncao.updateMany({ where: { colaboradorId: params.id, fim: null }, data: { fim: inicio } });
    if (b.funcaoId) {
      const f = await tx.sstFuncao.findUnique({ where: { id: b.funcaoId }, select: { id: true } });
      if (!f) throw new Error("Função não encontrada");
      await tx.sstColaboradorFuncao.create({ data: { colaboradorId: params.id, funcaoId: b.funcaoId, inicio } });
    }
  });
  return NextResponse.json({ ok: true });
}
