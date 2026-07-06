export const dynamic = "force-dynamic";

// OperacaoFiscal — natureza de operação do eixo FISCAL (vira natOp da NF-e).
// Separada do TipoOperacao/TES, que segue exclusivo do eixo gerencial de entrada.

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await requireModulo("fiscal");
  if (!auth.ok) return auth.response;

  const operacoes = await prisma.operacaoFiscal.findMany({
    orderBy: { codigo: "asc" },
    include: { _count: { select: { regras: true } } },
  });
  return NextResponse.json(operacoes);
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("fiscal");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const codigo = String(body.codigo ?? "").trim().toUpperCase().replace(/\s+/g, "_");
  const descricao = String(body.descricao ?? "").trim();
  const finalidade = Number(body.finalidade ?? 1);
  const tipoOperacao = Number(body.tipoOperacao ?? 1);

  if (!codigo || !descricao) {
    return NextResponse.json({ error: "Código e descrição são obrigatórios" }, { status: 400 });
  }
  if (![1, 2, 3, 4].includes(finalidade)) {
    return NextResponse.json({ error: "Finalidade inválida (1-4)" }, { status: 400 });
  }
  if (![0, 1].includes(tipoOperacao)) {
    return NextResponse.json({ error: "Tipo de operação inválido (0 entrada, 1 saída)" }, { status: 400 });
  }

  try {
    const operacao = await prisma.operacaoFiscal.create({
      data: { codigo, descricao, finalidade, tipoOperacao },
    });
    return NextResponse.json(operacao, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Já existe uma operação com este código nesta empresa" }, { status: 409 });
    }
    throw e;
  }
}
