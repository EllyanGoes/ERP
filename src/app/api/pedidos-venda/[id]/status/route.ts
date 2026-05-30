export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getItensPendentesEntrega } from "@/lib/pedido-totais";
import { z } from "zod";

const schema = z.object({ status: z.enum(["CONFIRMADO","EM_AGENDAMENTO","CONCLUIDO","CANCELADO"]) });

const TRANSITIONS: Record<string, string[]> = {
  ORCAMENTO:      ["CONFIRMADO", "CANCELADO"],
  CONFIRMADO:     ["EM_AGENDAMENTO", "CANCELADO"],
  EM_AGENDAMENTO: ["CONCLUIDO", "CANCELADO"],
  CONCLUIDO:      [],
  CANCELADO:      [],
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Status inválido" }, { status: 400 });

  const pedido = await prisma.pedidoVenda.findUnique({
    where: { id: params.id },
  });
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  const allowed = TRANSITIONS[pedido.status] ?? [];
  if (!allowed.includes(parsed.data.status)) {
    return NextResponse.json({ error: `Transição inválida: ${pedido.status} → ${parsed.data.status}` }, { status: 422 });
  }

  // Não permite concluir enquanto houver material pendente de entrega
  // (qtd pedida ainda não totalmente coberta por minutas ENTREGUE).
  if (parsed.data.status === "CONCLUIDO") {
    const pendentes = await getItensPendentesEntrega(params.id);
    if (pendentes.length > 0) {
      return NextResponse.json(
        {
          error: "Há material pendente de entrega. Conclua as entregas (minutas marcadas como Entregue) antes de finalizar o pedido.",
          pendentes,
        },
        { status: 422 },
      );
    }
  }

  // Nota: movimentações de estoque são geradas pelas Minutas (SAIU_PARA_ENTREGA),
  // não mais pelo status do pedido. Aqui apenas atualizamos o status.
  // Ao CONCLUIR, carimba a data de conclusão (se ainda não informada). Usa o dia
  // em horário de Brasília, gravado como meia-noite UTC (padrão dos campos de data).
  const updateData: { status: typeof parsed.data.status; dataEntrega?: Date } = { status: parsed.data.status };
  if (parsed.data.status === "CONCLUIDO" && !pedido.dataEntrega) {
    const hojeSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    updateData.dataEntrega = new Date(`${hojeSP}T00:00:00.000Z`);
  }

  const updated = await prisma.pedidoVenda.update({
    where: { id: params.id },
    data: updateData,
  });

  return NextResponse.json({ data: updated });
}
