export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { validarFaixas } from "@/lib/horario-trabalho";

// GET /api/rh/horarios — horários de trabalho com as faixas.
export async function GET() {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;
  const data = await prisma.horarioTrabalho.findMany({
    orderBy: { nome: "asc" },
    include: {
      faixas: { orderBy: { ordem: "asc" } },
      _count: { select: { escalas: true } },
    },
  });
  return NextResponse.json({ data });
}

// POST /api/rh/horarios — cria horário com as faixas.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const nome = String(b.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  const faixas = validarFaixas(b.faixas);
  if (!faixas) return NextResponse.json({ error: "Informe ao menos uma faixa com horas válidas (HH:MM)" }, { status: 400 });

  const horario = await prisma.horarioTrabalho.create({
    data: {
      nome,
      ativo: b.ativo !== false,
      faixas: { create: faixas.map((f, i) => ({ ...f, ordem: i })) },
    },
    include: { faixas: { orderBy: { ordem: "asc" } } },
  });
  return NextResponse.json({ data: horario }, { status: 201 });
}
