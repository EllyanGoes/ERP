export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const TIPOS = ["DINHEIRO","PIX","TRANSFERENCIA","BOLETO","CARTAO_CREDITO","CARTAO_DEBITO","CHEQUE","OUTROS"] as const;

const schema = z.object({
  nome: z.string().min(1),
  tipo: z.enum(TIPOS).default("OUTROS"),
  descricao: z.string().optional(),
});

export async function GET() {
  const data = await prisma.formaPagamento.findMany({ orderBy: { nome: "asc" } });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  const record = await prisma.formaPagamento.create({ data: body.data });
  return NextResponse.json(record, { status: 201 });
}
