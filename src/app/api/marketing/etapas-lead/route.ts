export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { etapaLeadSchema } from "@/lib/validations/marketing-lead";

// Pipeline padrão semeado no primeiro acesso (nenhuma etapa cadastrada ainda).
const ETAPAS_PADRAO = [
  { nome: "Novo", ordem: 0, cor: "#64748b", ganho: false },
  { nome: "Contato", ordem: 1, cor: "#0ea5e9", ganho: false },
  { nome: "Proposta", ordem: 2, cor: "#f59e0b", ganho: false },
  { nome: "Negociação", ordem: 3, cor: "#8b5cf6", ganho: false },
  { nome: "Ganho", ordem: 4, cor: "#22c55e", ganho: true },
];

export async function GET() {
  const totalGeral = await prisma.etapaLead.count();
  if (totalGeral === 0) {
    await prisma.etapaLead.createMany({ data: ETAPAS_PADRAO });
  }

  const etapas = await prisma.etapaLead.findMany({
    where: { ativo: true },
    orderBy: { ordem: "asc" },
  });
  return NextResponse.json({ data: etapas });
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = etapaLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const etapa = await prisma.etapaLead.create({ data: parsed.data });
  return NextResponse.json({ data: etapa }, { status: 201 });
}
