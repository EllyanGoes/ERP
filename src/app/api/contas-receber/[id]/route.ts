export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { pagamentoSchema } from "@/lib/validations/financeiro";
import { contaCaixaIdDaEmpresa } from "@/lib/empresa";
import { recomputarStatusPedido } from "@/lib/pedido-totais";
import { contabilizarTituloReceber } from "@/lib/contabilidade";
import { formaEletronicaNoCaixa } from "@/lib/roteamento-conta";

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

  const { dataPagamento, valorMulta, valorJuros } = parsed.data;

  // Normaliza para uma lista de formas (1 forma = compat). Estrutura igual ao
  // Pedido de Venda: cada forma cai na sua conta de destino e vira um lançamento.
  const linhasPag = (parsed.data.pagamentos && parsed.data.pagamentos.length > 0)
    ? parsed.data.pagamentos.map((p) => ({ forma: p.forma ?? null, contaBancariaId: p.contaBancariaId ?? null, valor: p.valor }))
    : [{ forma: parsed.data.formaPagamento ?? null, contaBancariaId: parsed.data.contaBancariaId ?? null, valor: parsed.data.valorPago ?? 0 }];
  const valorPagoTotal = Math.round(linhasPag.reduce((s, l) => s + l.valor, 0) * 100) / 100;
  const formaResumo = Array.from(new Set(linhasPag.map((l) => l.forma).filter(Boolean))).join(" + ") || null;

  // Leitura e escrita na MESMA transação, com guard otimista no update: um
  // duplo clique no "Baixar" não pode somar o mesmo recebimento duas vezes nem
  // criar dois lançamentos.
  const result = await prisma.$transaction(async (tx) => {
    const conta = await tx.contaReceber.findUnique({ where: { id: params.id } });
    if (!conta) return { erro: { msg: "Conta não encontrada", status: 404 }, data: null };
    if (conta.status === "PAGA" || conta.status === "CANCELADA") {
      return { erro: { msg: `Conta já está ${conta.status === "PAGA" ? "paga" : "cancelada"}.`, status: 409 }, data: null };
    }

    const totalPago = parseFloat(conta.valorPago.toString()) + valorPagoTotal;
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
        formaPagamento: formaResumo ?? conta.formaPagamento,
        status: newStatus,
      },
    });
    if (aplicado.count === 0) {
      return { erro: { msg: "A conta foi baixada por outra operação simultânea — recarregue e confira.", status: 409 }, data: null };
    }

    // Conta de destino efetiva por linha (cai no caixa da empresa se nada melhor).
    const linhasComConta = linhasPag.map((l) => ({
      ...l,
      contaDest: l.contaBancariaId && l.contaBancariaId !== "caixa-geral"
        ? l.contaBancariaId
        : (conta.contaBancariaId ?? contaCaixaIdDaEmpresa(conta.empresaId)),
    }));
    // Trava: forma eletrônica não pode cair no Caixa em Dinheiro (se há banco).
    const ruim = await formaEletronicaNoCaixa(tx, conta.empresaId,
      linhasComConta.map((l) => ({ forma: l.forma, contaBancariaId: l.contaDest })));
    if (ruim) {
      return { erro: { msg: `A forma "${ruim.forma}" não pode ser recebida no Caixa em Dinheiro — selecione a conta bancária de destino.`, status: 422 }, data: null };
    }

    // Um lançamento por forma (cada um na sua conta). Multa/juros entram na 1ª linha.
    for (let i = 0; i < linhasComConta.length; i++) {
      const l = linhasComConta[i];
      const extra = i === 0 ? valorMulta + valorJuros : 0;
      const contaDest = l.contaDest;
      await tx.lancamentoFinanceiro.create({
        data: {
          tipo: "RECEITA",
          descricao: `Recebimento ${conta.numero}${linhasPag.length > 1 && l.forma ? ` (${l.forma})` : ""}`,
          valor: l.valor + extra,
          dataLancamento: new Date(dataPagamento),
          contaReceberId: params.id,
          contaBancariaId: contaDest,
          naturezaFinanceiraId: conta.naturezaFinanceiraId ?? undefined,
          centroCustoId: conta.centroCustoId ?? undefined,
        },
      });
    }
    const updated = await tx.contaReceber.findUnique({ where: { id: params.id } });
    // O financeiro do pedido mudou → recomputa o status do pedido.
    if (conta.pedidoVendaId) await recomputarStatusPedido(tx, conta.pedidoVendaId);
    return { erro: null, data: updated };
  });

  if (result.erro) return NextResponse.json({ error: result.erro.msg }, { status: result.erro.status });
  // Contabiliza o recebimento (best-effort, pós-commit).
  await contabilizarTituloReceber(params.id).catch(() => {});
  return NextResponse.json({ data: result.data });
}
