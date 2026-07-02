export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { criarConferenciaDePedido } from "@/lib/pedido-compra-de";

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
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

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

    const pedido = await prisma.pedidoCompra.findUnique({ where: { id: pedidoId }, select: { id: true } });
    if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

    // Create conferencia + update PC status in a single transaction.
    // Criação unificada do DE (mesma função do POST /conferencias): copia TODOS
    // os campos da linha do pedido — unidade, TES, centro, compõe-custo, local
    // default e valores — senão a conversão de unidade e o custo saem errados
    // na conclusão.
    const conferencia = await prisma.$transaction(async (tx) => {
      const record = await criarConferenciaDePedido(tx, pedidoId);

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
