export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { pagamentoSchema } from "@/lib/validations/financeiro";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const conta = await prisma.contaReceber.findUnique({
    where: { id: params.id },
    include: { cliente: true, pedidoVenda: true, lancamentos: true },
  });
  if (!conta) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
  return NextResponse.json({ data: conta });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = pagamentoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });

  const { valorPago, dataPagamento, formaPagamento, valorMulta, valorJuros } = parsed.data;

  const conta = await prisma.contaReceber.findUnique({ where: { id: params.id } });
  if (!conta) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });

  const totalPago = parseFloat(conta.valorPago.toString()) + valorPago;
  const totalOriginal = parseFloat(conta.valorOriginal.toString());
  const newStatus = totalPago >= totalOriginal ? "PAGA" : "PARCIAL";

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.contaReceber.update({
      where: { id: params.id },
      data: {
        valorPago: totalPago,
        valorMulta: (parseFloat(conta.valorMulta.toString())) + valorMulta,
        valorJuros: (parseFloat(conta.valorJuros.toString())) + valorJuros,
        dataPagamento: newStatus === "PAGA" ? new Date(dataPagamento) : null,
        formaPagamento: formaPagamento ?? conta.formaPagamento,
        status: newStatus,
      },
    });
    await tx.lancamentoFinanceiro.create({
      data: {
        tipo: "RECEITA",
        descricao: `Recebimento ${conta.numero}`,
        valor: valorPago + valorMulta + valorJuros,
        dataLancamento: new Date(dataPagamento),
        contaReceberId: params.id,
        contaBancariaId: body.contaBancariaId ?? conta.contaBancariaId ?? "caixa-geral",
        categoriaFinanceiraId: conta.categoriaFinanceiraId ?? undefined,
        centroCustoId: conta.centroCustoId ?? undefined,
      },
    });
    return result;
  });

  return NextResponse.json({ data: updated });
}
