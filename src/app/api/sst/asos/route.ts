export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { somaMeses } from "@/lib/sst";

const INCLUDE = {
  colaborador: { select: { id: true, nome: true } },
  exames: { include: { exameTipo: { select: { id: true, nome: true } } } },
};

// GET /api/sst/asos?colaboradorId=  |  ?vencendoEmDias=60 (agenda)
export async function GET(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const sp = new URL(req.url).searchParams;
  const colaboradorId = sp.get("colaboradorId");
  const data = await prisma.sstAso.findMany({
    where: colaboradorId ? { colaboradorId } : {},
    orderBy: { data: "desc" },
    take: 500,
    include: INCLUDE,
  });
  return NextResponse.json({ data });
}

// POST /api/sst/asos { colaboradorId, tipo, data, validade?, resultado, restricoes?, medico?, crm?, documentoId?, exames: [{exameTipoId, data?, resultado?}] }
// Sem validade informada: periódico = data + periodicidade da função (menor
// periodicidade dos exames exigidos; default 12 meses).
export async function POST(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  if (!b.colaboradorId) return NextResponse.json({ error: "Informe o colaborador." }, { status: 400 });
  const tipo = ["ADMISSIONAL", "PERIODICO", "MUDANCA_RISCO", "RETORNO", "DEMISSIONAL"].includes(b.tipo) ? b.tipo : "PERIODICO";
  const resultado = ["APTO", "INAPTO", "APTO_RESTRICOES"].includes(b.resultado) ? b.resultado : "APTO";
  const data = b.data ? new Date(b.data) : new Date();
  let validade: Date | null = b.validade ? new Date(b.validade) : null;
  if (!validade && tipo !== "DEMISSIONAL") {
    const vinculo = await prismaSemEscopo.sstColaboradorFuncao.findFirst({
      where: { colaboradorId: b.colaboradorId, fim: null },
      select: { funcao: { select: { requisitosExame: { select: { periodicidadeMeses: true } } } } },
    });
    const periodos = vinculo?.funcao.requisitosExame.map((r) => r.periodicidadeMeses) ?? [];
    validade = somaMeses(data, periodos.length ? Math.min(...periodos) : 12);
  }
  const exames: { exameTipoId: string; data?: string; resultado?: string }[] = Array.isArray(b.exames) ? b.exames.filter((e: { exameTipoId?: string }) => e?.exameTipoId) : [];
  const aso = await prisma.sstAso.create({
    data: {
      empresaId: auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID,
      colaboradorId: b.colaboradorId, tipo, data, validade, resultado,
      restricoes: b.restricoes?.trim() || null, medico: b.medico?.trim() || null, crm: b.crm?.trim() || null,
      documentoId: b.documentoId || null,
      exames: { create: exames.map((e) => ({ exameTipoId: e.exameTipoId, data: e.data ? new Date(e.data) : data, resultado: e.resultado?.trim() || null })) },
    },
    include: INCLUDE,
  });
  return NextResponse.json({ data: aso }, { status: 201 });
}
