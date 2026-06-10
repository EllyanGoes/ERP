export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { transferenciaSchema } from "@/lib/validations/financeiro";

// Transferência entre contas → cria duas pernas espelhadas (tipo TRANSFERENCIA):
// origem com valor negativo, destino com valor positivo, ligadas por transferenciaParId.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = transferenciaSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });

  const { contaOrigemId, contaDestinoId, valor, dataLancamento, descricao } = parsed.data;
  const data = new Date(dataLancamento);
  const desc = descricao?.trim() || "Transferência entre contas";

  const result = await prisma.$transaction(async (tx) => {
    const origem = await tx.lancamentoFinanceiro.create({
      data: {
        tipo: "TRANSFERENCIA",
        descricao: desc,
        valor: -Math.abs(valor),
        dataLancamento: data,
        contaBancariaId: contaOrigemId,
      },
    });
    const destino = await tx.lancamentoFinanceiro.create({
      data: {
        tipo: "TRANSFERENCIA",
        descricao: desc,
        valor: Math.abs(valor),
        dataLancamento: data,
        contaBancariaId: contaDestinoId,
        transferenciaParId: origem.id,
      },
    });
    await tx.lancamentoFinanceiro.update({
      where: { id: origem.id },
      data: { transferenciaParId: destino.id },
    });
    return { origem, destino };
  });

  return NextResponse.json({ data: result }, { status: 201 });
}
