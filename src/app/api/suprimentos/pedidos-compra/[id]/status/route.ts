export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateDocNumber } from "@/lib/utils";

const TRANSITIONS: Record<string, string[]> = {
  RASCUNHO: ["ENVIADO", "CANCELADO"],
  ENVIADO: ["CONFIRMADO", "CANCELADO"],
  CONFIRMADO: ["EM_TRANSITO", "RECEBIDO", "CANCELADO"],
  EM_TRANSITO: ["RECEBIDO"],
  RECEBIDO: [],
  CANCELADO: [],
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { status } = body;

  const current = await prisma.pedidoCompra.findUnique({
    where: { id: params.id },
    include: {
      itens: true,
      conferencia: { select: { id: true } },
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

  let conferenciaId: string | null = null;

  if (status === "RECEBIDO" && !current.conferencia) {
    // Auto-create ConferenciaCompra
    await prisma.$transaction(async (tx) => {
      const seq = await tx.sequencia.upsert({
        where: { prefixo: "CF" },
        create: { prefixo: "CF", ultimo: 1 },
        update: { ultimo: { increment: 1 } },
      });
      const numero = generateDocNumber("CF", seq.ultimo);

      const conf = await tx.conferenciaCompra.create({
        data: {
          numero,
          pedidoId: params.id,
          status: "PENDENTE",
          itens: {
            create: current.itens.map((i) => ({
              itemId: i.itemId,
              quantidadePedida: parseFloat(String(i.quantidade)),
              quantidadeRecebida: 0,
            })),
          },
        },
      });

      conferenciaId = conf.id;

      await tx.pedidoCompra.update({
        where: { id: params.id },
        data: { status },
      });
    });
  } else {
    await prisma.pedidoCompra.update({
      where: { id: params.id },
      data: { status },
    });
    if (current.conferencia) conferenciaId = current.conferencia.id;
  }

  return NextResponse.json({ data: { id: params.id, status, conferenciaId } });
}
