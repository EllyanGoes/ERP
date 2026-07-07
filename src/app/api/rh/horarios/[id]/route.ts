export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { validarFaixas } from "@/lib/horario-trabalho";

// PATCH /api/rh/horarios/[id] — atualiza nome/ativo e substitui as faixas.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));

  const existe = await prisma.horarioTrabalho.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existe) return NextResponse.json({ error: "Horário não encontrado" }, { status: 404 });

  let faixas = null;
  if (b.faixas !== undefined) {
    faixas = validarFaixas(b.faixas);
    if (!faixas) return NextResponse.json({ error: "Informe ao menos uma faixa com horas válidas (HH:MM)" }, { status: 400 });
  }
  if (b.nome !== undefined && !String(b.nome).trim()) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }

  const horario = await prisma.$transaction(async (tx) => {
    if (faixas) {
      await tx.horarioTrabalhoFaixa.deleteMany({ where: { horarioId: params.id } });
      await tx.horarioTrabalhoFaixa.createMany({ data: faixas.map((f, i) => ({ horarioId: params.id, ...f, ordem: i })) });
    }
    return tx.horarioTrabalho.update({
      where: { id: params.id },
      data: {
        ...(b.nome !== undefined ? { nome: String(b.nome).trim() } : {}),
        ...(b.ativo !== undefined ? { ativo: !!b.ativo } : {}),
      },
      include: { faixas: { orderBy: { ordem: "asc" } } },
    });
  });
  return NextResponse.json({ data: horario });
}

// DELETE /api/rh/horarios/[id] — só sem escalas vinculadas.
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;
  const escalas = await prisma.colaboradorEscala.count({ where: { horarioId: params.id } });
  if (escalas > 0) {
    return NextResponse.json({ error: `Horário usado em ${escalas} escala(s) de colaborador` }, { status: 409 });
  }
  await prisma.horarioTrabalho.delete({ where: { id: params.id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
