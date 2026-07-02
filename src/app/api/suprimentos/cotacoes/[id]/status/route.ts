export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// CONCLUIDA NÃO entra aqui: a conclusão da cotação acontece SOMENTE pelo fluxo
// de aprovação (submeter-aprovacao → aprovar/gerarPedidoDeCotacao), que gera o
// Pedido de Compras. Permitir EM_ANALISE→CONCLUIDA manual pulava a aprovação.
const TRANSITIONS: Record<string, string[]> = {
  PENDENTE:   ["EM_ANALISE"],
  EM_ANALISE: ["PENDENTE"],
  CONCLUIDA:  [],
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const { status } = body;

  const current = await prisma.cotacaoCompra.findUnique({
    where: { id: params.id },
    select: { status: true },
  });

  if (!current) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const allowed = TRANSITIONS[current.status] ?? [];
  if (!allowed.includes(status)) {
    return NextResponse.json(
      { error: `Transição inválida: ${current.status} → ${status}` },
      { status: 422 }
    );
  }

  const record = await prisma.cotacaoCompra.update({
    where: { id: params.id },
    data: { status },
  });

  return NextResponse.json({ data: record });
}
