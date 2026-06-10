export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const TRANSITIONS: Record<string, string[]> = {
  PENDENTE:   ["EM_ANALISE"],
  EM_ANALISE: ["CONCLUIDA", "PENDENTE"],
  CONCLUIDA:  [],
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const { status } = body;

  const current = await prisma.cotacaoCompra.findUnique({
    where: { id: params.id },
    include: {
      fornecedores: {
        where: { status: "RESPONDIDA" },
        select: { id: true, totalCalculado: true },
        orderBy: { totalCalculado: "asc" },
      },
    },
  });

  if (!current) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const allowed = TRANSITIONS[current.status] ?? [];
  if (!allowed.includes(status)) {
    return NextResponse.json(
      { error: `Transição inválida: ${current.status} → ${status}` },
      { status: 422 }
    );
  }

  const updateData: Record<string, unknown> = { status };

  // When concluding, auto-set melhorOpcao on the cheapest respondida supplier
  if (status === "CONCLUIDA") {
    const respondidas = current.fornecedores;
    if (respondidas.length > 0) {
      const winner = respondidas[0]; // ordered by totalCalculado asc
      await prisma.$transaction([
        prisma.cotacaoFornecedor.updateMany({
          where: { cotacaoId: params.id },
          data: { melhorOpcao: false },
        }),
        prisma.cotacaoFornecedor.update({
          where: { id: winner.id },
          data: { melhorOpcao: true },
        }),
      ]);
    }
    updateData.dataAprovacao = new Date();
  }

  const record = await prisma.cotacaoCompra.update({
    where: { id: params.id },
    data: updateData,
  });

  return NextResponse.json({ data: record });
}
