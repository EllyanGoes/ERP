export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { requireAdmin } from "@/lib/auth";
import { pagamentoSchema, contaPagarSchema } from "@/lib/validations/financeiro";
import { recontabilizarTituloPagar } from "@/lib/contabilidade";
import { baixarTitulo, normalizarLinhasPagamento } from "@/lib/baixa-titulo";

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

  // Mudou o valorOriginal → o status precisa continuar coerente com o valorPago
  // (não deixar um título PAGA com pago < original, nem ABERTA com pago > 0).
  const pago = parseFloat(conta.valorPago.toString());
  const status = conta.status === "CANCELADA"
    ? conta.status
    : pago >= d.valorOriginal - 0.005 && pago > 0 ? "PAGA"
    : pago > 0.005 ? "PARCIAL"
    : "ABERTA";

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
      status,
    },
  });

  // Re-contabiliza com os dados novos (ex.: agora com fornecedor → passa pela
  // conta de Fornecedores a Pagar). O recontabilizar já apaga os lançamentos
  // antigos (COMPRA/PAGAMENTO) e regrava — nada de delete manual aqui.
  await recontabilizarTituloPagar(params.id).catch((e) => console.error("[contas-pagar] contabilizar:", e));

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
  // duplo clique no "Baixar" não soma o mesmo pagamento duas vezes.
  const result = await prisma.$transaction((tx) =>
    baixarTitulo(tx, {
      tipo: "PAGAR",
      tituloId: params.id,
      linhas,
      dataPagamento,
      valorMulta,
      valorJuros,
      naturezas: parsed.data.naturezas,
    }),
  );

  if (result.erro) return NextResponse.json({ error: result.erro.msg }, { status: result.erro.status });
  // Contabiliza o pagamento (best-effort, pós-commit).
  await recontabilizarTituloPagar(params.id).catch((e) => console.error("[contas-pagar] contabilizar:", e));
  return NextResponse.json({ data: result.conta });
}
