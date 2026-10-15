export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, EMPRESA_PADRAO_ID } from "@/lib/prisma";

const INCLUDE = {
  exameTipo: { select: { id: true, nome: true } },
  aso: { select: { id: true, tipo: true, data: true } },
};

// GET /api/sst/exames?colaboradorId= — exames realizados (com ou sem ASO).
export async function GET(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const colaboradorId = new URL(req.url).searchParams.get("colaboradorId");
  const data = await prisma.sstExame.findMany({
    where: colaboradorId ? { colaboradorId } : {},
    orderBy: { data: "desc" },
    take: 500,
    include: INCLUDE,
  });
  return NextResponse.json({ data });
}

// POST /api/sst/exames — lança um ou mais exames realizados, independentes do ASO.
// { colaboradorId, data, asoId?, documentoId?, observacao?, exames: [{ exameTipoId, resultado? }] }
// (o médico pode ter dado apto e pedido exames novos depois — eles entram aqui).
export async function POST(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  if (!b.colaboradorId) return NextResponse.json({ error: "Informe o colaborador." }, { status: 400 });
  const itens: { exameTipoId: string; resultado?: string | null }[] = Array.isArray(b.exames) ? b.exames.filter((e: { exameTipoId?: string }) => e?.exameTipoId) : [];
  if (itens.length === 0) return NextResponse.json({ error: "Selecione ao menos um exame." }, { status: 400 });
  const data = b.data ? new Date(b.data) : new Date();
  if (b.asoId) {
    const aso = await prisma.sstAso.findUnique({ where: { id: String(b.asoId) }, select: { colaboradorId: true } });
    if (!aso || aso.colaboradorId !== b.colaboradorId) return NextResponse.json({ error: "ASO não pertence ao colaborador." }, { status: 400 });
  }
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const criados = await prisma.$transaction(itens.map((e) => prisma.sstExame.create({
    data: {
      empresaId, colaboradorId: b.colaboradorId, exameTipoId: e.exameTipoId, data,
      resultado: e.resultado?.trim() || null, observacao: b.observacao?.trim() || null,
      documentoId: b.documentoId || null, asoId: b.asoId || null,
    },
    include: INCLUDE,
  })));
  return NextResponse.json({ data: criados }, { status: 201 });
}
