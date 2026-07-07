export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// POST /api/empresa/colaboradores/escalas-lote — aplica a mesma vigência de
// escala (horário + data) a vários colaboradores de uma vez (compartilhar).
export async function POST(req: NextRequest) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const b = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(b.colaboradorIds) ? b.colaboradorIds.filter((x: unknown) => typeof x === "string") : [];
  if (!b.horarioId) return NextResponse.json({ error: "Escolha o horário de trabalho" }, { status: 400 });
  if (!b.data) return NextResponse.json({ error: "Informe a data de início da vigência" }, { status: 400 });
  if (!ids.length) return NextResponse.json({ error: "Selecione ao menos um colaborador" }, { status: 400 });

  const horario = await prisma.horarioTrabalho.findUnique({ where: { id: b.horarioId }, select: { id: true } });
  if (!horario) return NextResponse.json({ error: "Horário não encontrado" }, { status: 400 });

  const data = new Date(`${String(b.data).slice(0, 10)}T12:00:00`);
  const validos = await prisma.colaborador.findMany({ where: { id: { in: ids } }, select: { id: true } });

  // Não duplica: pula quem já tem vigência desse horário na mesma data.
  const existentes = await prisma.colaboradorEscala.findMany({
    where: { colaboradorId: { in: validos.map((c) => c.id) }, horarioId: b.horarioId, data },
    select: { colaboradorId: true },
  });
  const jaTem = new Set(existentes.map((e) => e.colaboradorId));
  const novos = validos.filter((c) => !jaTem.has(c.id));

  if (novos.length) {
    await prisma.colaboradorEscala.createMany({
      data: novos.map((c) => ({ colaboradorId: c.id, horarioId: b.horarioId, data })),
    });
  }
  return NextResponse.json({ data: { criadas: novos.length, puladas: validos.length - novos.length } }, { status: 201 });
}
