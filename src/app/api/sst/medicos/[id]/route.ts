export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const normCrm = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");

// PATCH /api/sst/medicos/:id { nome?, crm?, uf?, especialidade?, ativo? }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (b.nome !== undefined) { const n = String(b.nome).trim(); if (!n) return NextResponse.json({ error: "Informe o nome." }, { status: 400 }); data.nome = n; }
  if (b.crm !== undefined) {
    const crm = normCrm(b.crm);
    if (!crm) return NextResponse.json({ error: "Informe o CRM." }, { status: 400 });
    const outro = await prisma.sstMedico.findFirst({ where: { crm, id: { not: params.id } } });
    if (outro) return NextResponse.json({ error: `CRM ${crm} já cadastrado (${outro.nome}).` }, { status: 409 });
    data.crm = crm;
  }
  if (b.uf !== undefined) data.uf = String(b.uf ?? "").trim().toUpperCase().slice(0, 2) || null;
  if (b.especialidade !== undefined) data.especialidade = String(b.especialidade ?? "").trim() || null;
  if (b.ativo !== undefined) data.ativo = !!b.ativo;
  const med = await prisma.sstMedico.update({ where: { id: params.id }, data });
  return NextResponse.json({ data: med });
}

// DELETE — só sem ASO vinculado; com histórico, inativa.
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const n = await prisma.sstAso.count({ where: { medicoId: params.id } });
  if (n > 0) {
    await prisma.sstMedico.update({ where: { id: params.id }, data: { ativo: false } });
    return NextResponse.json({ data: { inativado: true } });
  }
  await prisma.sstMedico.delete({ where: { id: params.id } });
  return NextResponse.json({ data: { excluido: true } });
}
