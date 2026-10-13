export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, EMPRESA_PADRAO_ID } from "@/lib/prisma";

export async function GET() {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const data = await prisma.sstTreinamentoTipo.findMany({ orderBy: { nome: "asc" }, include: { _count: { select: { requisitos: true, turmas: true } } } });
  return NextResponse.json({ data });
}
export async function POST(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const nome = String(b.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "Informe o nome do treinamento." }, { status: 400 });
  try {
    const t = await prisma.sstTreinamentoTipo.create({ data: { empresaId: auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID, nome, norma: b.norma?.trim() || null, cargaHoraria: b.cargaHoraria ? Number(b.cargaHoraria) : null, validadeMeses: b.validadeMeses ? Number(b.validadeMeses) : null } });
    return NextResponse.json({ data: t }, { status: 201 });
  } catch { return NextResponse.json({ error: "Já existe um treinamento com esse nome." }, { status: 400 }); }
}
