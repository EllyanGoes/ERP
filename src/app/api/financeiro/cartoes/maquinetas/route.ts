export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { maquinetaSchema } from "./schema";

// Maquinetas (terminais): vinculam a venda no cartão à administradora e carregam
// taxa (%) e prazo de compensação (dias) por tipo de cartão (crédito/débito).

export async function GET() {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const data = await prisma.maquineta.findMany({
    include: {
      administradora: { select: { id: true, nome: true } },
      taxas: { orderBy: { tipoForma: "asc" } },
    },
    orderBy: { nome: "asc" },
  });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const parsed = maquinetaSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  const { administradoraId, nome, ativo, taxas } = parsed.data;

  const admin = await prisma.administradoraCartao.findUnique({ where: { id: administradoraId }, select: { id: true } });
  if (!admin) return NextResponse.json({ error: "Administradora não encontrada" }, { status: 404 });

  const dup = await prisma.maquineta.findFirst({ where: { nome }, select: { id: true } });
  if (dup) return NextResponse.json({ error: "Já existe uma maquineta com esse nome." }, { status: 422 });

  const maquineta = await prisma.maquineta.create({
    data: {
      administradoraId,
      nome,
      ativo: ativo ?? true,
      taxas: { create: taxas.map((t) => ({ tipoForma: t.tipoForma, taxaPct: t.taxaPct, diasCompensacao: t.diasCompensacao })) },
    },
    include: { taxas: true },
  });
  return NextResponse.json({ data: maquineta }, { status: 201 });
}
