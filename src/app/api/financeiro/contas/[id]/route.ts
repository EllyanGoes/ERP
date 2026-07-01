export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { contaBancariaSchema } from "@/lib/validations/financeiro";

// GET → conta + extrato (lançamentos com saldo corrente acumulado)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const de = searchParams.get("de");
  const ate = searchParams.get("ate");

  const conta = await prisma.contaBancaria.findUnique({
    where: { id: params.id },
    include: { banco: { select: { id: true, nome: true } } },
  });
  if (!conta) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });

  const where: any = { contaBancariaId: params.id };
  if (de || ate) {
    where.dataLancamento = {};
    if (de) where.dataLancamento.gte = new Date(de);
    if (ate) where.dataLancamento.lte = new Date(ate);
  }

  const lancamentos = await prisma.lancamentoFinanceiro.findMany({
    where,
    include: {
      naturezaFinanceira: { select: { id: true, nome: true } },
      contaReceber: { select: { id: true, numero: true, cliente: { select: { razaoSocial: true, nomeFantasia: true } }, pedidoVenda: { select: { id: true, numero: true } } } },
      contaPagar: { select: { id: true, numero: true, fornecedor: { select: { razaoSocial: true, nomeFantasia: true } } } },
    },
    orderBy: [{ dataLancamento: "asc" }, { createdAt: "asc" }],
  });

  // Saldo corrente acumulado a partir do saldoInicial.
  let saldo = Number(conta.saldoInicial);
  const extrato = lancamentos.map((l) => {
    const v = Number(l.valor);
    saldo += l.tipo === "DESPESA" ? -v : v;
    return { ...l, saldoCorrente: saldo };
  });

  return NextResponse.json({ data: { ...conta, saldoAtual: saldo, extrato } });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = contaBancariaSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });

  const conta = await prisma.contaBancaria.update({
    where: { id: params.id },
    data: {
      nome: parsed.data.nome,
      bancoId: parsed.data.bancoId || null,
      agencia: parsed.data.agencia || null,
      numero: parsed.data.numero || null,
      tipo: parsed.data.tipo,
      saldoInicial: parsed.data.saldoInicial,
      ativo: parsed.data.ativo,
    },
  });
  return NextResponse.json({ data: conta });
}

// Inativação (não exclui se houver lançamentos — FK RESTRICT).
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  // A transitória de compensação (Encontro de Contas) é gerada pelo sistema e
  // não pode ser excluída/inativada — as baixas do encontro passam por ela.
  const conta = await prisma.contaBancaria.findUnique({ where: { id: params.id }, select: { compensacao: true } });
  if (conta?.compensacao) {
    return NextResponse.json({ error: "A conta de compensação (Encontro de Contas) não pode ser excluída." }, { status: 400 });
  }

  const count = await prisma.lancamentoFinanceiro.count({ where: { contaBancariaId: params.id } });
  if (count > 0) {
    await prisma.contaBancaria.update({ where: { id: params.id }, data: { ativo: false } });
    return NextResponse.json({ data: { ok: true, inativada: true } });
  }
  await prisma.contaBancaria.delete({ where: { id: params.id } });
  return NextResponse.json({ data: { ok: true } });
}
