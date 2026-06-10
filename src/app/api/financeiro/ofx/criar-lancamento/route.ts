export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { ofxCriarLancamentoSchema } from "@/lib/validations/financeiro";

// Cria um lançamento a partir de uma linha OFX órfã (sem correspondência) e já a concilia.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = ofxCriarLancamentoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });

  const linha = await prisma.linhaOFX.findUnique({
    where: { id: parsed.data.linhaId },
    include: { importacao: { select: { contaBancariaId: true } } },
  });
  if (!linha) return NextResponse.json({ error: "Linha não encontrada" }, { status: 404 });
  if (linha.lancamentoConciliadoId) return NextResponse.json({ error: "Linha já conciliada" }, { status: 409 });

  const valor = Number(linha.valor);
  const tipo = valor >= 0 ? "RECEITA" : "DESPESA";

  const lancamento = await prisma.$transaction(async (tx) => {
    const novo = await tx.lancamentoFinanceiro.create({
      data: {
        tipo,
        descricao: linha.descricao || `Lançamento OFX`,
        valor: Math.abs(valor),
        dataLancamento: linha.data,
        contaBancariaId: linha.importacao.contaBancariaId,
        categoriaFinanceiraId: parsed.data.categoriaFinanceiraId || null,
        centroCustoId: parsed.data.centroCustoId || null,
        conciliado: true,
      },
    });
    await tx.linhaOFX.update({ where: { id: linha.id }, data: { lancamentoConciliadoId: novo.id } });
    return novo;
  });

  return NextResponse.json({ data: lancamento }, { status: 201 });
}
