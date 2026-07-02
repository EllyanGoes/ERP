export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { transferenciaSchema } from "@/lib/validations/financeiro";
import { contabilizarTransferencia } from "@/lib/contabilidade";

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

  // O espelho contábil (D destino / C origem) só balanceia dentro de UMA empresa;
  // origem ≠ destino é o mínimo de sanidade.
  if (contaOrigemId === contaDestinoId) {
    return NextResponse.json({ error: "Origem e destino devem ser contas diferentes." }, { status: 422 });
  }
  const contas = await prisma.contaBancaria.findMany({
    where: { id: { in: [contaOrigemId, contaDestinoId] } },
    select: { id: true, empresaId: true },
  });
  if (contas.length !== 2 || contas[0].empresaId !== contas[1].empresaId) {
    return NextResponse.json({ error: "Transferência exige duas contas da MESMA empresa." }, { status: 422 });
  }

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

  // Espelho contábil (D destino / C origem) — pós-commit, idempotente.
  await contabilizarTransferencia(result.origem.id).catch((e) => console.error("[transferencias] contabilizar:", e));

  return NextResponse.json({ data: result }, { status: 201 });
}
