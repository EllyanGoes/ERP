export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";

export async function GET() {
  const tabelas = await prisma.tabelaPreco.findMany({
    include: {
      _count: { select: { itens: true } },
      itens: {
        select: { itemId: true, precoVenda: true, vlrDesconto: true },
      },
    },
    orderBy: { codigo: "asc" },
  });
  return NextResponse.json({ data: tabelas });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { descricao, dataInicial, dataFinal, condicaoPagamento, tipoHorario, ativa, ecommerce, observacoes } = body;

  if (!descricao?.trim()) return NextResponse.json({ error: "Descrição obrigatória" }, { status: 400 });
  if (!dataInicial)       return NextResponse.json({ error: "Data Inicial obrigatória" }, { status: 400 });

  // Generate sequential code (001, 002, ...)
  const seq = await prisma.sequencia.upsert({
    where: { empresaId_prefixo: { empresaId: EMPRESA_PADRAO_ID, prefixo: "TP" } },
    create: { prefixo: "TP", ultimo: 1 },
    update: { ultimo: { increment: 1 } },
  });
  const codigo = String(seq.ultimo).padStart(3, "0");

  const tabela = await prisma.tabelaPreco.create({
    data: {
      codigo,
      descricao: descricao.trim(),
      dataInicial:       new Date(dataInicial),
      dataFinal:         dataFinal ? new Date(dataFinal) : null,
      condicaoPagamento: condicaoPagamento?.trim() || null,
      tipoHorario:       tipoHorario ?? "UNICO",
      ativa:             ativa ?? true,
      ecommerce:         ecommerce ?? false,
      observacoes:       observacoes?.trim() || null,
    },
  });

  return NextResponse.json({ data: tabela }, { status: 201 });
}
