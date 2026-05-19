export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TRANSITIONS: Record<string, string[]> = {
  AGUARDANDO_PAGAMENTO: ["EM_TRANSITO", "CANCELADO"],
  EM_TRANSITO:          ["CONFIRMADO",  "CANCELADO"],
  CONFIRMADO:           [],
  CANCELADO:            [],
  // legado — registros antigos podem migrar para o novo fluxo
  RASCUNHO:  ["AGUARDANDO_PAGAMENTO", "CANCELADO"],
  ENVIADO:   ["AGUARDANDO_PAGAMENTO", "CANCELADO"],
  RECEBIDO:  [],
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { status } = body;

  const current = await prisma.pedidoCompra.findUnique({
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

  await prisma.pedidoCompra.update({
    where: { id: params.id },
    data: { status },
  });

  return NextResponse.json({ data: { id: params.id, status } });
}
