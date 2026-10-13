export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { pendenciasObrigacoes } from "@/lib/sst";

// GET /api/sst/obrigacoes — com o documento vigente e a situação.
export async function GET() {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const { obrigacoes } = await pendenciasObrigacoes(empresaId);
  return NextResponse.json({ data: obrigacoes });
}

// POST { nome, norma?, categoriaGedId, periodicidadeMeses?, responsavelId?, observacoes? }
export async function POST(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const nome = String(b.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "Informe o nome da obrigação." }, { status: 400 });
  if (!b.categoriaGedId) return NextResponse.json({ error: "Escolha a categoria do GED onde o documento vive." }, { status: 400 });
  try {
    const o = await prisma.sstObrigacao.create({
      data: { empresaId: auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID, nome, norma: b.norma?.trim() || null, categoriaGedId: b.categoriaGedId, periodicidadeMeses: b.periodicidadeMeses ? Number(b.periodicidadeMeses) : null, responsavelId: b.responsavelId || null, observacoes: b.observacoes?.trim() || null },
    });
    return NextResponse.json({ data: o }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Já existe uma obrigação com esse nome nesta empresa." }, { status: 400 });
  }
}
