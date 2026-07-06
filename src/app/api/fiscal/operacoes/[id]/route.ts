export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("fiscal");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.descricao !== undefined) {
    const descricao = String(body.descricao).trim();
    if (!descricao) return NextResponse.json({ error: "Descrição é obrigatória" }, { status: 400 });
    data.descricao = descricao;
  }
  if (body.finalidade !== undefined) {
    const finalidade = Number(body.finalidade);
    if (![1, 2, 3, 4].includes(finalidade)) return NextResponse.json({ error: "Finalidade inválida" }, { status: 400 });
    data.finalidade = finalidade;
  }
  if (body.tipoOperacao !== undefined) {
    const tipoOperacao = Number(body.tipoOperacao);
    if (![0, 1].includes(tipoOperacao)) return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
    data.tipoOperacao = tipoOperacao;
  }
  if (body.ativo !== undefined) data.ativo = Boolean(body.ativo);

  const operacao = await prisma.operacaoFiscal.update({ where: { id: params.id }, data });
  return NextResponse.json(operacao);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("fiscal");
  if (!auth.ok) return auth.response;

  const operacao = await prisma.operacaoFiscal.findUnique({
    where: { id: params.id },
    include: { _count: { select: { regras: true } } },
  });
  if (!operacao) return NextResponse.json({ error: "Operação não encontrada" }, { status: 404 });

  const notas = await prisma.notaFiscal.findFirst({
    where: { operacaoFiscalId: params.id },
    select: { id: true },
  });
  if (notas) {
    return NextResponse.json({ error: "Operação já usada em notas — desative em vez de excluir" }, { status: 409 });
  }

  // regras da operação caem junto (cadastro, sem histórico)
  await prisma.regraTributacao.deleteMany({ where: { operacaoFiscalId: params.id } });
  await prisma.operacaoFiscal.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
