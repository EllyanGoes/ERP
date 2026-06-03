export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { categoriaFinanceiraSchema } from "@/lib/validations/financeiro";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const parsed = categoriaFinanceiraSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });

  if (parsed.data.paiId === params.id) {
    return NextResponse.json({ error: "Uma categoria não pode ser pai de si mesma" }, { status: 400 });
  }

  const categoria = await prisma.categoriaFinanceira.update({
    where: { id: params.id },
    data: {
      nome: parsed.data.nome,
      tipo: parsed.data.tipo,
      paiId: parsed.data.paiId || null,
      centroCustoId: parsed.data.centroCustoId || null,
      ativo: parsed.data.ativo,
    },
  });
  return NextResponse.json({ data: categoria });
}

// Inativação se houver vínculos (filhos ou lançamentos); senão exclui.
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const [filhos, lancamentos, cr, cp] = await Promise.all([
    prisma.categoriaFinanceira.count({ where: { paiId: params.id } }),
    prisma.lancamentoFinanceiro.count({ where: { categoriaFinanceiraId: params.id } }),
    prisma.contaReceber.count({ where: { categoriaFinanceiraId: params.id } }),
    prisma.contaPagar.count({ where: { categoriaFinanceiraId: params.id } }),
  ]);
  if (filhos + lancamentos + cr + cp > 0) {
    await prisma.categoriaFinanceira.update({ where: { id: params.id }, data: { ativo: false } });
    return NextResponse.json({ data: { ok: true, inativada: true } });
  }
  await prisma.categoriaFinanceira.delete({ where: { id: params.id } });
  return NextResponse.json({ data: { ok: true } });
}
