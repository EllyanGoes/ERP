export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { baixaLoteSchema } from "@/lib/validations/financeiro";
import { baixarTitulo } from "@/lib/baixa-titulo";
import { recontabilizarTituloReceber, recontabilizarTituloPagar } from "@/lib/contabilidade";

const r2 = (n: number) => Math.round(n * 100) / 100;

// Quita vários títulos de uma vez, gerando um lançamento por título na conta
// escolhida. Cada título passa pelo mesmo núcleo da baixa individual
// (baixarTitulo): guard otimista, teto anti-overpay, trava de roteamento e
// recomputo do status do pedido vinculado — títulos não baixáveis são pulados.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = baixaLoteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });

  const { tipo, ids, contaBancariaId, dataPagamento } = parsed.data;
  const data = new Date(dataPagamento);

  const baixados = await prisma.$transaction(async (tx) => {
    const ok: string[] = [];
    for (const id of ids) {
      // Saldo restante lido na mesma transação; o baixarTitulo revalida com o
      // guard otimista (status + valorPago) antes de escrever.
      const c = tipo === "RECEBER"
        ? await tx.contaReceber.findUnique({ where: { id }, select: { status: true, valorOriginal: true, valorPago: true } })
        : await tx.contaPagar.findUnique({ where: { id }, select: { status: true, valorOriginal: true, valorPago: true } });
      if (!c || c.status === "PAGA" || c.status === "CANCELADA") continue;
      const restante = r2(Number(c.valorOriginal) - Number(c.valorPago));
      if (restante <= 0) continue;

      const r = await baixarTitulo(tx, {
        tipo,
        tituloId: id,
        linhas: [{ forma: null, contaBancariaId, valor: restante }],
        dataPagamento: data,
      });
      // Título que não pôde ser baixado (corrida/trava) é pulado — o baixarTitulo
      // não escreve nada antes de validar, então pular é seguro.
      if (r.erro) continue;
      ok.push(id);
    }
    return ok;
  });

  // Contabiliza cada baixa (best-effort, pós-commit). O recomputo do status dos
  // pedidos vinculados já aconteceu dentro da transação, via baixarTitulo.
  for (const id of baixados) {
    if (tipo === "RECEBER") await recontabilizarTituloReceber(id).catch((e) => console.error("[financeiro/baixar-lote] contabilizar:", e));
    else await recontabilizarTituloPagar(id).catch((e) => console.error("[financeiro/baixar-lote] contabilizar:", e));
  }

  return NextResponse.json({ data: { baixados: baixados.length } });
}
