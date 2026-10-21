export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { AGENDAMENTO_INCLUDE, PERIODOS, STATUS_AGENDAMENTO, TIPOS_ASO_AGENDAVEIS, precosParaClinica } from "@/lib/sst-agendamento";

// PATCH /api/sst/agendamentos/[id] { status?, data?, periodo?, tipoAso?, observacoes?, exames?: [exameTipoId], asoId? }
// Remarcar = mudar data/período (volta a AGENDADO). asoId liga o ASO do retorno e marca REALIZADO.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const atual = await prisma.sstAgendamento.findUnique({ where: { id: params.id }, select: { id: true, clinicaId: true, status: true } });
  if (!atual) return NextResponse.json({ error: "Agendamento não encontrado." }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (b.status !== undefined) {
    if (!STATUS_AGENDAMENTO.includes(b.status)) return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    data.status = b.status;
  }
  if (b.data !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.data))) return NextResponse.json({ error: "Data inválida." }, { status: 400 });
    data.data = new Date(`${b.data}T00:00:00Z`);
    if (b.status === undefined && ["FALTOU", "CANCELADO", "CONFIRMADO"].includes(atual.status)) data.status = "AGENDADO";
  }
  if (b.periodo !== undefined) {
    if (!PERIODOS.includes(b.periodo)) return NextResponse.json({ error: "Período inválido." }, { status: 400 });
    data.periodo = b.periodo;
  }
  if (b.tipoAso !== undefined) {
    if (!TIPOS_ASO_AGENDAVEIS.includes(b.tipoAso)) return NextResponse.json({ error: "Tipo de ASO inválido." }, { status: 400 });
    data.tipoAso = b.tipoAso;
  }
  if (b.observacoes !== undefined) data.observacoes = String(b.observacoes ?? "").trim() || null;
  if (b.asoId !== undefined) {
    data.asoId = b.asoId || null;
    if (b.asoId && b.status === undefined) data.status = "REALIZADO";
  }

  const ag = await prisma.$transaction(async (tx) => {
    await tx.sstAgendamento.update({ where: { id: params.id }, data });
    if (Array.isArray(b.exames)) {
      const ids = Array.from(new Set((b.exames as unknown[]).map(String).filter(Boolean)));
      const precos = await precosParaClinica(tx, atual.clinicaId, ids);
      await tx.sstAgendamentoExame.deleteMany({ where: { agendamentoId: params.id } });
      if (ids.length) await tx.sstAgendamentoExame.createMany({ data: ids.map((exameTipoId) => ({ agendamentoId: params.id, exameTipoId, preco: precos.get(exameTipoId) ?? null })) });
    }
    return tx.sstAgendamento.findUnique({ where: { id: params.id }, include: AGENDAMENTO_INCLUDE });
  });
  return NextResponse.json({ data: ag });
}
