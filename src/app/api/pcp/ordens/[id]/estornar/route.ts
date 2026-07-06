export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { estornarApontamentoOrdem } from "@/lib/pcp/estorno";
import { respostaSaldoNegativo, SaldoNegativoError } from "@/lib/estoque-guard";

// POST — Estorna o apontamento de uma ordem de produção: desfaz TUDO que o
// apontamento gerou (estoque, movimentos, biomassa, contábil) e devolve a OP/etapas
// para o estado pré-apontamento, liberando-a para reapontamento ou exclusão.
// O motor vive em src/lib/pcp/estorno.ts (reusado pela edição de OP apontada).
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const ordem = await prisma.ordemProducao.findUnique({
    where: { id: params.id },
    select: { id: true, empresaId: true },
  });
  if (!ordem) return NextResponse.json({ error: "Ordem não encontrada" }, { status: 404 });

  try {
    await prisma.$transaction(async (tx) => {
      await estornarApontamentoOrdem(tx, { ordemId: params.id, empresaId: ordem.empresaId });
    }, { timeout: 60000 });
  } catch (e) {
    if (e instanceof SaldoNegativoError) return respostaSaldoNegativo(e);
    throw e;
  }

  return NextResponse.json({ ok: true });
}
