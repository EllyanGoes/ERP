export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { recorrenciaSchema } from "@/lib/validations/financeiro";

export async function GET() {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const data = await prisma.recorrencia.findMany({
    include: {
      naturezaFinanceira: { select: { id: true, nome: true } },
      contaBancaria: { select: { id: true, nome: true } },
      cliente: { select: { id: true, razaoSocial: true } },
      fornecedor: { select: { id: true, razaoSocial: true } },
    },
    orderBy: [{ ativo: "desc" }, { proximaGeracao: "asc" }],
  });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = recorrenciaSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });

  const recorrencia = await prisma.recorrencia.create({
    data: {
      tipo: parsed.data.tipo,
      descricao: parsed.data.descricao,
      valor: parsed.data.valor,
      naturezaFinanceiraId: parsed.data.naturezaFinanceiraId || null,
      contaBancariaId: parsed.data.contaBancariaId || null,
      clienteId: parsed.data.clienteId || null,
      fornecedorId: parsed.data.fornecedorId || null,
      centroCustoId: parsed.data.centroCustoId || null,
      periodicidade: parsed.data.periodicidade,
      diaVencimento: parsed.data.diaVencimento,
      proximaGeracao: new Date(parsed.data.proximaGeracao),
      ativo: parsed.data.ativo,
      observacoes: parsed.data.observacoes || null,
    },
  });
  return NextResponse.json({ data: recorrencia }, { status: 201 });
}
