export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { pagamentoSchema } from "@/lib/validations/financeiro";
import { contaCaixaIdDaEmpresa } from "@/lib/empresa";
import { recomputarStatusPedido } from "@/lib/pedido-totais";

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

  const { valorPago, dataPagamento, formaPagamento, valorMulta, valorJuros, contaBancariaId } = parsed.data;

  // Leitura e escrita na MESMA transação, com guard otimista no update: um
  // duplo clique no "Baixar" não pode somar o mesmo recebimento duas vezes nem
  // criar dois lançamentos.
  const result = await prisma.$transaction(async (tx) => {
    const conta = await tx.contaReceber.findUnique({ where: { id: params.id } });
    if (!conta) return { erro: { msg: "Conta não encontrada", status: 404 }, data: null };
    if (conta.status === "PAGA" || conta.status === "CANCELADA") {
      return { erro: { msg: `Conta já está ${conta.status === "PAGA" ? "paga" : "cancelada"}.`, status: 409 }, data: null };
    }

    const totalPago = parseFloat(conta.valorPago.toString()) + valorPago;
    const totalOriginal = parseFloat(conta.valorOriginal.toString());
    const newStatus = totalPago >= totalOriginal ? "PAGA" : "PARCIAL";

    // Só aplica se status/valorPago não mudaram desde a leitura acima — a
    // requisição concorrente que perder a corrida cai no count === 0.
    const aplicado = await tx.contaReceber.updateMany({
      where: { id: params.id, status: conta.status, valorPago: conta.valorPago },
      data: {
        valorPago: totalPago,
        valorMulta: (parseFloat(conta.valorMulta.toString())) + valorMulta,
        valorJuros: (parseFloat(conta.valorJuros.toString())) + valorJuros,
        dataPagamento: newStatus === "PAGA" ? new Date(dataPagamento) : null,
        formaPagamento: formaPagamento ?? conta.formaPagamento,
        status: newStatus,
      },
    });
    if (aplicado.count === 0) {
      return { erro: { msg: "A conta foi baixada por outra operação simultânea — recarregue e confira.", status: 409 }, data: null };
    }

    await tx.lancamentoFinanceiro.create({
      data: {
        tipo: "RECEITA",
        descricao: `Recebimento ${conta.numero}`,
        valor: valorPago + valorMulta + valorJuros,
        dataLancamento: new Date(dataPagamento),
        contaReceberId: params.id,
        contaBancariaId: contaBancariaId ?? conta.contaBancariaId ?? contaCaixaIdDaEmpresa(conta.empresaId),
        categoriaFinanceiraId: conta.categoriaFinanceiraId ?? undefined,
        centroCustoId: conta.centroCustoId ?? undefined,
      },
    });
    const updated = await tx.contaReceber.findUnique({ where: { id: params.id } });
    // O financeiro do pedido mudou → recomputa o status do pedido.
    if (conta.pedidoVendaId) await recomputarStatusPedido(tx, conta.pedidoVendaId);
    return { erro: null, data: updated };
  });

  if (result.erro) return NextResponse.json({ error: result.erro.msg }, { status: result.erro.status });
  return NextResponse.json({ data: result.data });
}
