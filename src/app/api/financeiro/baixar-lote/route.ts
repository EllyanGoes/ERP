export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { baixaLoteSchema } from "@/lib/validations/financeiro";

// Quita vários títulos de uma vez, gerando um lançamento por título na conta escolhida.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = baixaLoteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });

  const { tipo, ids, contaBancariaId, dataPagamento } = parsed.data;
  const data = new Date(dataPagamento);

  const result = await prisma.$transaction(async (tx) => {
    let baixados = 0;
    for (const id of ids) {
      if (tipo === "RECEBER") {
        const c = await tx.contaReceber.findUnique({ where: { id } });
        if (!c || c.status === "PAGA" || c.status === "CANCELADA") continue;
        const restante = Number(c.valorOriginal) - Number(c.valorPago);
        if (restante <= 0) continue;
        await tx.contaReceber.update({
          where: { id },
          data: { valorPago: c.valorOriginal, status: "PAGA", dataPagamento: data },
        });
        await tx.lancamentoFinanceiro.create({
          data: {
            tipo: "RECEITA",
            descricao: `Recebimento ${c.numero}`,
            valor: restante,
            dataLancamento: data,
            contaReceberId: id,
            contaBancariaId,
            categoriaFinanceiraId: c.categoriaFinanceiraId ?? undefined,
            centroCustoId: c.centroCustoId ?? undefined,
          },
        });
        baixados++;
      } else {
        const c = await tx.contaPagar.findUnique({ where: { id } });
        if (!c || c.status === "PAGA" || c.status === "CANCELADA") continue;
        const restante = Number(c.valorOriginal) - Number(c.valorPago);
        if (restante <= 0) continue;
        await tx.contaPagar.update({
          where: { id },
          data: { valorPago: c.valorOriginal, status: "PAGA", dataPagamento: data },
        });
        await tx.lancamentoFinanceiro.create({
          data: {
            tipo: "DESPESA",
            descricao: `Pagamento ${c.numero}`,
            valor: restante,
            dataLancamento: data,
            contaPagarId: id,
            contaBancariaId,
            categoriaFinanceiraId: c.categoriaFinanceiraId ?? undefined,
            centroCustoId: c.centroCustoId ?? undefined,
          },
        });
        baixados++;
      }
    }
    return baixados;
  });

  return NextResponse.json({ data: { baixados: result } });
}
