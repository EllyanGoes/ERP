export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, EMPRESA_PADRAO_ID } from "@/lib/prisma";

const INCLUDE = { membros: { include: { colaborador: { select: { id: true, nome: true } } } }, reunioes: { orderBy: { data: "desc" as const } } };

export async function GET() {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const data = await prisma.sstCipaMandato.findMany({ orderBy: { inicio: "desc" }, include: INCLUDE });
  return NextResponse.json({ data });
}

// POST { inicio, fim, ataEleicaoDocumentoId?, observacoes?, membros: [{colaboradorId, papel, representa}] }
export async function POST(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  if (!b.inicio || !b.fim) return NextResponse.json({ error: "Informe início e fim do mandato." }, { status: 400 });
  const membros: { colaboradorId: string; papel: string; representa: string }[] = Array.isArray(b.membros) ? b.membros.filter((m: { colaboradorId?: string }) => m?.colaboradorId) : [];
  const m = await prisma.sstCipaMandato.create({
    data: {
      empresaId: auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID, inicio: new Date(b.inicio), fim: new Date(b.fim),
      ataEleicaoDocumentoId: b.ataEleicaoDocumentoId || null, observacoes: b.observacoes?.trim() || null,
      membros: { create: membros.map((x) => ({ colaboradorId: x.colaboradorId, papel: x.papel || "TITULAR", representa: x.representa || "EMPREGADOS" })) },
    },
    include: INCLUDE,
  });
  return NextResponse.json({ data: m }, { status: 201 });
}
