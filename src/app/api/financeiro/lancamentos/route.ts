export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { lancamentoFinanceiroSchema } from "@/lib/validations/financeiro";

export async function GET(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const contaBancariaId = searchParams.get("contaBancariaId") || undefined;
  const tipo = searchParams.get("tipo") || undefined;

  const data = await prisma.lancamentoFinanceiro.findMany({
    where: {
      ...(contaBancariaId ? { contaBancariaId } : {}),
      ...(tipo ? { tipo: tipo as any } : {}),
    },
    include: {
      contaBancaria: { select: { id: true, nome: true } },
      naturezaFinanceira: { select: { id: true, nome: true } },
      contaReceber: { select: { id: true, numero: true } },
      contaPagar: { select: { id: true, numero: true } },
    },
    orderBy: [{ dataLancamento: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  return NextResponse.json({ data });
}

// Lançamento avulso (não vinculado a título). Movimenta o caixa diretamente.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = lancamentoFinanceiroSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });

  const lancamento = await prisma.lancamentoFinanceiro.create({
    data: {
      tipo: parsed.data.tipo,
      descricao: parsed.data.descricao,
      valor: parsed.data.valor,
      dataLancamento: new Date(parsed.data.dataLancamento),
      dataVencimento: parsed.data.dataVencimento ? new Date(parsed.data.dataVencimento) : null,
      dataCompetencia: parsed.data.dataCompetencia ? new Date(parsed.data.dataCompetencia) : null,
      contaBancariaId: parsed.data.contaBancariaId,
      naturezaFinanceiraId: parsed.data.naturezaFinanceiraId || null,
      centroCustoId: parsed.data.centroCustoId || null,
      favorecido: parsed.data.favorecido || null,
      observacoes: parsed.data.observacoes || null,
    },
  });
  return NextResponse.json({ data: lancamento }, { status: 201 });
}
