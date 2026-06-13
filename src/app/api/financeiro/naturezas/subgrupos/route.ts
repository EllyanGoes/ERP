export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { z } from "zod";

const GRUPOS = ["RECEITA_OPERACIONAL", "CUSTO_OPERACIONAL", "DESPESA_OPERACIONAL", "INVESTIMENTO", "FINANCIAMENTO"] as const;

const schema = z.object({
  nome: z.string().min(1),
  grupo: z.enum(GRUPOS),
});

export async function GET() {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const data = await prisma.naturezaSubgrupo.findMany({
    where: { ativo: true },
    orderBy: [{ grupo: "asc" }, { nome: "asc" }],
  });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });

  const data = await prisma.naturezaSubgrupo.create({ data: parsed.data });
  return NextResponse.json({ data }, { status: 201 });
}
