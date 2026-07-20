export const dynamic = "force-dynamic";
// Ajuste MANUAL de uma parcela da grade de duplicatas do Documento de Entrada
// (vencimento e/ou valor), depois de gerada automaticamente. Só título ABERTO e
// sem pagamento — parcela paga/parcial é história financeira, não grade. A soma
// da grade é responsabilidade da tela (aviso quando diverge do líquido do DE).
import { NextRequest, NextResponse } from "next/server";
import { requireModuloAny } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { recontabilizarTituloPagar } from "@/lib/contabilidade";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModuloAny(["compras", "financeiro"]);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const temValor = body.valorOriginal !== undefined;
  const temVenc = body.dataVencimento !== undefined;
  if (!temValor && !temVenc) {
    return NextResponse.json({ error: "Nada para ajustar." }, { status: 400 });
  }

  const cp = await prisma.contaPagar.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, valorPago: true },
  });
  if (!cp) return NextResponse.json({ error: "Título não encontrado" }, { status: 404 });
  if (cp.status !== "ABERTA" || parseFloat(String(cp.valorPago)) > 0.005) {
    return NextResponse.json({ error: "Só parcelas em aberto (sem pagamento) podem ser ajustadas." }, { status: 422 });
  }

  const data: { valorOriginal?: number; dataVencimento?: Date | null } = {};
  if (temValor) {
    const v = parseFloat(String(body.valorOriginal));
    if (!(v > 0)) return NextResponse.json({ error: "Valor deve ser maior que zero." }, { status: 422 });
    data.valorOriginal = Math.round(v * 100) / 100;
  }
  if (temVenc) {
    data.dataVencimento = body.dataVencimento
      ? new Date(`${String(body.dataVencimento).slice(0, 10)}T00:00:00.000Z`)
      : null;
  }

  const atualizado = await prisma.contaPagar.update({ where: { id: cp.id }, data });
  await recontabilizarTituloPagar(cp.id).catch(() => {});
  return NextResponse.json({ data: atualizado });
}
