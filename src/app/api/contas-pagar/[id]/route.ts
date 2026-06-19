export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { requireAdmin } from "@/lib/auth";
import { pagamentoSchema, contaPagarSchema } from "@/lib/validations/financeiro";
import { contaCaixaIdDaEmpresa } from "@/lib/empresa";
import { recomputarStatusFinanceiroCompra } from "@/lib/pedido-totais";
import { contabilizarTituloPagar } from "@/lib/contabilidade";
import { formaEletronicaNoCaixa } from "@/lib/roteamento-conta";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const conta = await prisma.contaPagar.findUnique({
    where: { id: params.id },
    include: { fornecedor: true, lancamentos: true },
  });
  if (!conta) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
  return NextResponse.json({ data: conta });
}

// PUT: edição dos dados do título (admin) — usado para corrigir contas a pagar,
// ex.: informar o fornecedor que faltava. Re-contabiliza o título.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = contaPagarSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const conta = await prisma.contaPagar.findUnique({ where: { id: params.id } });
  if (!conta) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });

  const atualizado = await prisma.contaPagar.update({
    where: { id: params.id },
    data: {
      fornecedorId: d.fornecedorId || null,
      beneficiarioTipo: d.beneficiarioTipo ?? null,
      beneficiarioId: d.beneficiarioId ?? null,
      descricao: d.descricao,
      valorOriginal: d.valorOriginal,
      dataVencimento: new Date(d.dataVencimento),
      formaPagamento: d.formaPagamento || null,
      notaFiscal: d.notaFiscal || null,
      observacoes: d.observacoes || null,
      naturezaFinanceiraId: d.naturezaFinanceiraId || null,
      centroCustoId: d.centroCustoId || null,
      contaBancariaId: d.contaBancariaId || null,
    },
  });

  // Re-contabiliza: apaga os lançamentos de origem (COMPRA/PAGAMENTO) deste título
  // e regenera com os dados novos (ex.: agora com fornecedor → passa pela conta
  // de Fornecedores a Pagar). PartidaContabil não tem FK cascade — apagar à mão.
  const lancs = await prismaSemEscopo.lancamentoContabil.findMany({
    where: { empresaId: conta.empresaId, origemTipo: { in: ["COMPRA", "PAGAMENTO"] }, origemId: params.id },
    select: { id: true },
  });
  for (const l of lancs) {
    await prismaSemEscopo.partidaContabil.deleteMany({ where: { lancamentoId: l.id } });
    await prismaSemEscopo.lancamentoContabil.delete({ where: { id: l.id } });
  }
  await contabilizarTituloPagar(params.id).catch(() => {});

  return NextResponse.json({ data: atualizado });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = pagamentoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });

  const { dataPagamento, valorMulta, valorJuros } = parsed.data;

  // Normaliza para uma lista de formas (1 forma = compat). Estrutura igual ao
  // Pedido de Venda: cada forma sai da sua conta e vira um lançamento.
  const linhasPag = (parsed.data.pagamentos && parsed.data.pagamentos.length > 0)
    ? parsed.data.pagamentos.map((p) => ({ forma: p.forma ?? null, contaBancariaId: p.contaBancariaId ?? null, valor: p.valor }))
    : [{ forma: parsed.data.formaPagamento ?? null, contaBancariaId: parsed.data.contaBancariaId ?? null, valor: parsed.data.valorPago ?? 0 }];
  const valorPagoTotal = Math.round(linhasPag.reduce((s, l) => s + l.valor, 0) * 100) / 100;
  const formaResumo = Array.from(new Set(linhasPag.map((l) => l.forma).filter(Boolean))).join(" + ") || null;

  // Leitura e escrita na MESMA transação, com guard otimista no update: um
  // duplo clique no "Baixar" não pode somar o mesmo pagamento duas vezes nem
  // criar dois lançamentos.
  const result = await prisma.$transaction(async (tx) => {
    const conta = await tx.contaPagar.findUnique({ where: { id: params.id } });
    if (!conta) return { erro: { msg: "Conta não encontrada", status: 404 }, data: null };
    if (conta.status === "PAGA" || conta.status === "CANCELADA") {
      return { erro: { msg: `Conta já está ${conta.status === "PAGA" ? "paga" : "cancelada"}.`, status: 409 }, data: null };
    }

    const totalPago = parseFloat(conta.valorPago.toString()) + valorPagoTotal;
    const totalOriginal = parseFloat(conta.valorOriginal.toString());
    const newStatus = totalPago >= totalOriginal ? "PAGA" : "PARCIAL";

    // Só aplica se status/valorPago não mudaram desde a leitura acima — a
    // requisição concorrente que perder a corrida cai no count === 0.
    const aplicado = await tx.contaPagar.updateMany({
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
      contaOrigem: l.contaBancariaId && l.contaBancariaId !== "caixa-geral"
        ? l.contaBancariaId
        : (conta.contaBancariaId ?? contaCaixaIdDaEmpresa(conta.empresaId)),
    }));
    // Trava: forma eletrônica não pode cair no Caixa em Dinheiro (se há banco).
    const ruim = await formaEletronicaNoCaixa(tx, conta.empresaId,
      linhasComConta.map((l) => ({ forma: l.forma, contaBancariaId: l.contaOrigem })));
    if (ruim) {
      return { erro: { msg: `A forma "${ruim.forma}" não pode ser paga pelo Caixa em Dinheiro — selecione a conta bancária de origem.`, status: 422 }, data: null };
    }

    // Um lançamento por forma (cada um na sua conta). Multa/juros entram na 1ª linha.
    for (let i = 0; i < linhasComConta.length; i++) {
      const l = linhasComConta[i];
      const extra = i === 0 ? valorMulta + valorJuros : 0;
      const contaOrigem = l.contaOrigem;
      await tx.lancamentoFinanceiro.create({
        data: {
          tipo: "DESPESA",
          descricao: `Pagamento ${conta.numero}${linhasPag.length > 1 && l.forma ? ` (${l.forma})` : ""}`,
          valor: l.valor + extra,
          dataLancamento: new Date(dataPagamento),
          contaPagarId: params.id,
          contaBancariaId: contaOrigem,
          naturezaFinanceiraId: conta.naturezaFinanceiraId ?? undefined,
          centroCustoId: conta.centroCustoId ?? undefined,
        },
      });
    }
    const updated = await tx.contaPagar.findUnique({ where: { id: params.id } });
    // Mudou o financeiro do pedido de compra → recomputa o status.
    if (conta.pedidoCompraId) await recomputarStatusFinanceiroCompra(tx, conta.pedidoCompraId);
    return { erro: null, data: updated };
  });

  if (result.erro) return NextResponse.json({ error: result.erro.msg }, { status: result.erro.status });
  // Contabiliza o pagamento (best-effort, pós-commit).
  await contabilizarTituloPagar(params.id).catch(() => {});
  return NextResponse.json({ data: result.data });
}
