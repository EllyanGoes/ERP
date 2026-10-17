export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// PATCH /api/sst/instrutores/:id { nome?, entidade?, registro?, ativo? }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (b.nome !== undefined) { const n = String(b.nome).trim(); if (!n) return NextResponse.json({ error: "Informe o nome." }, { status: 400 }); data.nome = n; }
  if (b.entidade !== undefined) data.entidade = String(b.entidade ?? "").trim() || null;
  if (b.registro !== undefined) data.registro = String(b.registro ?? "").trim() || null;
  if (b.ativo !== undefined) data.ativo = !!b.ativo;
  const r = await prisma.sstInstrutor.update({ where: { id: params.id }, data });
  return NextResponse.json({ data: r });
}
