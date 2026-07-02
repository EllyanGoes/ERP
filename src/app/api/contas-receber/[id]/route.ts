export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { requireAdmin } from "@/lib/auth";
import { pagamentoSchema, contaReceberSchema } from "@/lib/validations/financeiro";
import { recontabilizarTituloReceber } from "@/lib/contabilidade";
import { baixarTitulo, normalizarLinhasPagamento } from "@/lib/baixa-titulo";

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

// PUT: edição dos dados do título a receber (admin). Re-contabiliza o título.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = contaReceberSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const conta = await prisma.contaReceber.findUnique({ where: { id: params.id } });
  if (!conta) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });

  // Invariante "título segue cliente do pedido": num título nascido de pedido a
  // troca do cliente estoura o razonete por cliente — bloqueia.
  if (conta.pedidoVendaId && (d.clienteId || null) !== conta.clienteId) {
    return NextResponse.json({ error: "Este título nasce de um pedido de venda — o cliente segue o cliente do pedido e não pode ser trocado aqui." }, { status: 422 });
  }

  // Mudou o valorOriginal → o status precisa continuar coerente com o valorPago.
  const pago = parseFloat(conta.valorPago.toString());
  const status = conta.status === "CANCELADA"
    ? conta.status
    : pago >= d.valorOriginal - 0.005 && pago > 0 ? "PAGA"
    : pago > 0.005 ? "PARCIAL"
    : "ABERTA";

  const atualizado = await prisma.contaReceber.update({
    where: { id: params.id },
    data: {
      clienteId: d.clienteId || null,
      beneficiarioTipo: d.beneficiarioTipo ?? null,
      beneficiarioId: d.beneficiarioId ?? null,
      descricao: d.descricao,
      valorOriginal: d.valorOriginal,
      dataVencimento: new Date(d.dataVencimento),
      observacoes: d.observacoes || null,
      naturezaFinanceiraId: d.naturezaFinanceiraId || null,
      centroCustoId: d.centroCustoId || null,
      contaBancariaId: d.contaBancariaId || null,
      status,
    },
  });

  // Re-contabiliza com os dados novos. O recontabilizar já apaga os lançamentos
  // antigos (VENDA/RECEBIMENTO) e regrava — nada de delete manual aqui.
  await recontabilizarTituloReceber(params.id).catch((e) => console.error("[contas-receber] contabilizar:", e));

  return NextResponse.json({ data: atualizado });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = pagamentoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });

  const { dataPagamento, valorMulta, valorJuros } = parsed.data;
  const { linhas } = normalizarLinhasPagamento(parsed.data);

  // Leitura e escrita na MESMA transação, com guard otimista (baixarTitulo): um
  // duplo clique no "Baixar" não soma o mesmo recebimento duas vezes.
  const result = await prisma.$transaction((tx) =>
    baixarTitulo(tx, {
      tipo: "RECEBER",
      tituloId: params.id,
      linhas,
      dataPagamento,
      valorMulta,
      valorJuros,
      valorTaxa: parsed.data.valorTaxa,
      taxaNaturezaId: parsed.data.taxaNaturezaId ?? null,
    }),
  );

  if (result.erro) return NextResponse.json({ error: result.erro.msg }, { status: result.erro.status });
  // Contabiliza o recebimento (best-effort, pós-commit).
  await recontabilizarTituloReceber(params.id).catch((e) => console.error("[contas-receber] contabilizar:", e));
  return NextResponse.json({ data: result.conta });
}
