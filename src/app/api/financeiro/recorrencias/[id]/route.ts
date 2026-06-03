export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recorrenciaSchema } from "@/lib/validations/financeiro";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const parsed = recorrenciaSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });

  const recorrencia = await prisma.recorrencia.update({
    where: { id: params.id },
    data: {
      tipo: parsed.data.tipo,
      descricao: parsed.data.descricao,
      valor: parsed.data.valor,
      categoriaFinanceiraId: parsed.data.categoriaFinanceiraId || null,
      contaBancariaId: parsed.data.contaBancariaId || null,
      clienteId: parsed.data.clienteId || null,
      fornecedorId: parsed.data.fornecedorId || null,
      centroCustoId: parsed.data.centroCustoId || null,
      periodicidade: parsed.data.periodicidade,
      diaVencimento: parsed.data.diaVencimento,
      proximaGeracao: new Date(parsed.data.proximaGeracao),
      ativo: parsed.data.ativo,
      observacoes: parsed.data.observacoes || null,
    },
  });
  return NextResponse.json({ data: recorrencia });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const vinculos = await prisma.contaReceber.count({ where: { recorrenciaId: params.id } })
    + await prisma.contaPagar.count({ where: { recorrenciaId: params.id } });
  if (vinculos > 0) {
    await prisma.recorrencia.update({ where: { id: params.id }, data: { ativo: false } });
    return NextResponse.json({ data: { ok: true, inativada: true } });
  }
  await prisma.recorrencia.delete({ where: { id: params.id } });
  return NextResponse.json({ data: { ok: true } });
}
