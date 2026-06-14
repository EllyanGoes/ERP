export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  nome: z.string().min(1),
  descricao: z.string().optional(),
  numeroParcelas: z.coerce.number().int().min(1).default(1),
  prazoInicial: z.coerce.number().int().min(0).default(0),
  intervaloParcelas: z.coerce.number().int().min(0).default(30),
  diasParcelas: z.string().optional().nullable(),
  semVencimento: z.boolean().default(false),
  descontoVista: z.coerce.number().min(0).max(100).optional().nullable(),
});

export async function GET() {
  const data = await prisma.condicaoPagamento.findMany({ orderBy: { nome: "asc" } });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  const record = await prisma.condicaoPagamento.create({ data: body.data });
  return NextResponse.json(record, { status: 201 });
}
