export const dynamic = "force-dynamic";
// Troca a CONTA (origem do dinheiro) de lançamentos de um título PAGO — o
// caso "paguei pela conta errada" sem precisar reabrir e baixar de novo.
// Valores/datas não mudam aqui (para isso, Reabrir + nova baixa).
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { recontabilizarTituloPagar } from "@/lib/contabilidade";

type Params = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const trocas: { lancamentoId?: string; contaBancariaId?: string }[] = Array.isArray(body.trocas) ? body.trocas : [];
  if (trocas.length === 0) return NextResponse.json({ error: "Nada para alterar." }, { status: 400 });

  const conta = await prisma.contaPagar.findUnique({
    where: { id: params.id },
    select: { id: true, empresaId: true, lancamentos: { select: { id: true } } },
  });
  if (!conta) return NextResponse.json({ error: "Título não encontrado" }, { status: 404 });
  const lancIds = new Set(conta.lancamentos.map((l) => l.id));

  // Valida cada troca: lançamento é do título; a conta nova é da MESMA empresa,
  // ativa e não é a transitória de compensação.
  for (const t of trocas) {
    if (!t.lancamentoId || !lancIds.has(t.lancamentoId)) {
      return NextResponse.json({ error: "Lançamento não pertence a este título." }, { status: 422 });
    }
    const cb = t.contaBancariaId
      ? await prisma.contaBancaria.findFirst({
          where: { id: t.contaBancariaId, empresaId: conta.empresaId, ativo: true, compensacao: false },
          select: { id: true },
        })
      : null;
    if (!cb) return NextResponse.json({ error: "Conta bancária inválida para a empresa do título." }, { status: 422 });
  }

  await prisma.$transaction(async (tx) => {
    for (const t of trocas) {
      await tx.lancamentoFinanceiro.update({
        where: { id: t.lancamentoId! },
        data: { contaBancariaId: t.contaBancariaId! },
      });
    }
    // Conta "designada" do título acompanha quando o pagamento tem 1 linha só.
    if (conta.lancamentos.length === 1 && trocas.length === 1) {
      await tx.contaPagar.update({ where: { id: conta.id }, data: { contaBancariaId: trocas[0].contaBancariaId! } });
    }
  });

  // Reprocessa o razão: a perna de pagamento sai da conta contábil da conta
  // bancária — trocar a conta muda as partidas.
  await recontabilizarTituloPagar(conta.id).catch((e) => console.error("[lancamentos] contabilizar:", e));

  return NextResponse.json({ ok: true });
}
