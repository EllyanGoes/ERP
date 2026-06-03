export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Exclui em lote as parcelas EM ABERTO de um grupo de parcelamento.
// Parcelas pagas/parciais/canceladas e que tenham lançamentos são preservadas.
export async function DELETE(req: NextRequest, { params }: { params: { grupoId: string } }) {
  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo"); // "receber" | "pagar"

  if (tipo === "pagar") {
    const { count } = await prisma.contaPagar.deleteMany({
      where: { grupoParcelamentoId: params.grupoId, status: "ABERTA", lancamentos: { none: {} } },
    });
    return NextResponse.json({ data: { excluidas: count } });
  }
  const { count } = await prisma.contaReceber.deleteMany({
    where: { grupoParcelamentoId: params.grupoId, status: "ABERTA", lancamentos: { none: {} } },
  });
  return NextResponse.json({ data: { excluidas: count } });
}
