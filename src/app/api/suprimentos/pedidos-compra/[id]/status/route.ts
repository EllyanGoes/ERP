export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateSimpleDocNumber } from "@/lib/utils";

const TRANSITIONS: Record<string, string[]> = {
  AGUARDANDO_PAGAMENTO: ["EM_TRANSITO", "CANCELADO"],
  EM_TRANSITO:          ["RECEBIDO",    "CANCELADO"],
  CONFIRMADO:           ["RECEBIDO",    "CANCELADO"], // legado — permite migrar
  CANCELADO:            [],
  // legado — registros antigos podem migrar para o novo fluxo
  RASCUNHO:  ["AGUARDANDO_PAGAMENTO", "CANCELADO"],
  ENVIADO:   ["AGUARDANDO_PAGAMENTO", "CANCELADO"],
  RECEBIDO:  [],
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { status } = body;
  const pedidoId = params.id;

  const current = await prisma.pedidoCompra.findUnique({
    where: { id: pedidoId },
    select: { status: true, fornecedorId: true },
  });

  if (!current) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const allowed = TRANSITIONS[current.status] ?? [];
  if (!allowed.includes(status)) {
    return NextResponse.json(
      { error: `Transição inválida: ${current.status} → ${status}` },
      { status: 422 }
    );
  }

  // ── Transition to RECEBIDO: auto-create Doc. de Entrada if not exists ───
  if (status === "RECEBIDO") {
    // Check if conferencia already exists
    const existing = await prisma.conferenciaCompra.findUnique({
      where: { pedidoId },
      select: { id: true, numero: true },
    });

    if (existing) {
      // Already exists — just update status
      await prisma.pedidoCompra.update({ where: { id: pedidoId }, data: { status } });
      return NextResponse.json({
        data: {
          id: pedidoId,
          status,
          conferenciaId:      existing.id,
          conferenciaNumero:  existing.numero,
          conferenciaCreated: false,
        },
      });
    }

    // Create conferencia + update PC status in a single transaction
    const pedido = await prisma.pedidoCompra.findUnique({
      where: { id: pedidoId },
      include: { itens: true },
    });

    if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

    const conferencia = await prisma.$transaction(async (tx) => {
      const seq = await tx.sequencia.upsert({
        where: { prefixo: "DE" },
        create: { prefixo: "DE", ultimo: 1 },
        update: { ultimo: { increment: 1 } },
      });
      const numero = generateSimpleDocNumber("DE", seq.ultimo);

      const record = await tx.conferenciaCompra.create({
        data: {
          numero,
          pedidoId,
          fornecedorId: pedido.fornecedorId ?? null,
          itens: {
            create: pedido.itens.map((i) => ({
              itemId:             i.itemId,
              quantidadePedida:   parseFloat(String(i.quantidade)),
              quantidadeRecebida: 0,
              vlrUnitario:        i.precoUnitario != null ? parseFloat(String(i.precoUnitario)) : null,
              vlrTotal:           i.valorTotal    != null ? parseFloat(String(i.valorTotal))    : null,
            })),
          },
        },
        select: { id: true, numero: true },
      });

      await tx.pedidoCompra.update({ where: { id: pedidoId }, data: { status } });

      return record;
    });

    return NextResponse.json({
      data: {
        id: pedidoId,
        status,
        conferenciaId:      conferencia.id,
        conferenciaNumero:  conferencia.numero,
        conferenciaCreated: true,
      },
    });
  }

  // ── All other transitions ─────────────────────────────────────────────────
  await prisma.pedidoCompra.update({
    where: { id: pedidoId },
    data: { status },
  });

  return NextResponse.json({ data: { id: pedidoId, status } });
}
