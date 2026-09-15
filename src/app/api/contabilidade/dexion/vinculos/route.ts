export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { guardDexion } from "../_shared";

// GET /api/contabilidade/dexion/vinculos — vínculos empresa×exercício → código Dexion
export async function GET() {
  const g = await guardDexion();
  if (!g.ok) return g.response;
  const where = g.session.empresaIds?.length ? { empresaId: { in: g.session.empresaIds } } : {};
  const data = await prismaSemEscopo.dexionVinculoEmpresa.findMany({ where, orderBy: [{ empresaId: "asc" }, { exercicio: "desc" }] });
  return NextResponse.json({ data });
}

// POST { empresaId, exercicio, codigoDexion } — cria/atualiza
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const g = await guardDexion(body.empresaId);
  if (!g.ok) return g.response;
  const exercicio = Number(body.exercicio), codigoDexion = Number(body.codigoDexion);
  if (!Number.isInteger(exercicio) || exercicio < 2000 || !Number.isInteger(codigoDexion)) {
    return NextResponse.json({ error: "Informe exercício e código do Dexion." }, { status: 400 });
  }
  const data = await prismaSemEscopo.dexionVinculoEmpresa.upsert({
    where: { empresaId_exercicio: { empresaId: g.empresaId, exercicio } },
    update: { codigoDexion },
    create: { empresaId: g.empresaId, exercicio, codigoDexion },
  });
  return NextResponse.json({ data });
}

// DELETE ?id=
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const v = await prismaSemEscopo.dexionVinculoEmpresa.findUnique({ where: { id } });
  if (!v) return NextResponse.json({ error: "Vínculo não encontrado" }, { status: 404 });
  const g = await guardDexion(v.empresaId);
  if (!g.ok) return g.response;
  await prismaSemEscopo.dexionVinculoEmpresa.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
