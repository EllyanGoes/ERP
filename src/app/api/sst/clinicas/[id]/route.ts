export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { CLINICA_INCLUDE, dadosClinica, salvarPrecosClinica } from "@/lib/sst-agendamento";

// PATCH /api/sst/clinicas/[id] — dados, ativo e (se vier) a tabela de preços inteira.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const dados = dadosClinica(b);
  if ("nome" in b && !dados.nome) return NextResponse.json({ error: "Informe o nome da clínica." }, { status: 400 });
  const data = await prisma.$transaction(async (tx) => {
    const { nome, ...resto } = dados;
    await tx.sstClinica.update({ where: { id: params.id }, data: { ...resto, ...(nome ? { nome } : {}), ...(typeof b.ativo === "boolean" ? { ativo: b.ativo } : {}) } });
    if (Array.isArray(b.precos)) await salvarPrecosClinica(tx, params.id, b.precos);
    return tx.sstClinica.findUnique({ where: { id: params.id }, include: CLINICA_INCLUDE });
  });
  return NextResponse.json({ data });
}

// DELETE — com agendamentos vira inativação (o histórico aponta para ela).
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const usos = await prisma.sstAgendamento.count({ where: { clinicaId: params.id } });
  if (usos > 0) {
    await prisma.sstClinica.update({ where: { id: params.id }, data: { ativo: false } });
    return NextResponse.json({ data: { inativada: true } });
  }
  await prisma.sstClinica.delete({ where: { id: params.id } });
  return NextResponse.json({ data: { ok: true } });
}
