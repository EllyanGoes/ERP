export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { notifyMovimentacao } from "@/lib/notify-estoque";

const schema = z.object({ status: z.enum(["CONFIRMADO","EM_PRODUCAO","FATURADO","ENTREGUE","CANCELADO"]) });

const TRANSITIONS: Record<string, string[]> = {
  ORCAMENTO: ["CONFIRMADO", "CANCELADO"],
  CONFIRMADO: ["EM_PRODUCAO", "CANCELADO"],
  EM_PRODUCAO: ["FATURADO", "CANCELADO"],
  FATURADO: ["ENTREGUE", "CANCELADO"],
  ENTREGUE: [],
  CANCELADO: [],
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Status inválido" }, { status: 400 });

  const pedido = await prisma.pedidoVenda.findUnique({
    where: { id: params.id },
    include: { itens: true },
  });
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  const allowed = TRANSITIONS[pedido.status] ?? [];
  if (!allowed.includes(parsed.data.status)) {
    return NextResponse.json({ error: `Transição inválida: ${pedido.status} → ${parsed.data.status}` }, { status: 422 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.pedidoVenda.update({
      where: { id: params.id },
      data: { status: parsed.data.status },
    });

    // When delivered: create stock outflow for each item
    if (parsed.data.status === "ENTREGUE") {
      for (const item of pedido.itens) {
        const estoque = await tx.estoqueItem.findFirst({ where: { itemId: item.itemId } });
        if (estoque) {
          const saldoAntes = parseFloat(estoque.quantidadeAtual.toString());
          const qty = parseFloat(item.quantidade.toString());
          const saldoDepois = saldoAntes - qty;
          await tx.estoqueItem.update({ where: { id: estoque.id }, data: { quantidadeAtual: saldoDepois } });
          await tx.movimentacaoEstoque.create({
            data: {
              itemId: item.itemId,
              pedidoVendaItemId: item.id,
              tipo: "SAIDA",
              quantidade: qty,
              saldoAntes,
              saldoDepois,
              documento: pedido.numero,
              observacoes: `Saída por entrega do pedido ${pedido.numero}`,
            },
          });
        }
      }
    }

    return result;
  });

  // Notify Telegram for ENTREGUE (best-effort, outside transaction)
  if (parsed.data.status === "ENTREGUE") {
    for (const item of pedido.itens) {
      const qty = parseFloat(item.quantidade.toString());
      if (qty <= 0) continue;

      prisma.estoqueItem.findFirst({
        where: { itemId: item.itemId },
        include: {
          localEstoque: { select: { nome: true } },
          item: { select: { codigo: true, descricao: true, unidadeMedida: true, unidade: { select: { sigla: true } } } },
        },
      }).then((estoqueAtual) => {
        if (!estoqueAtual) return;
        notifyMovimentacao({
          tipo: "SAIDA",
          itemDescricao: estoqueAtual.item.descricao,
          itemCodigo: estoqueAtual.item.codigo ?? null,
          quantidade: qty,
          saldoDepois: parseFloat(String(estoqueAtual.quantidadeAtual)),
          unidade: estoqueAtual.item.unidade?.sigla ?? estoqueAtual.item.unidadeMedida ?? "un",
          localNome: estoqueAtual.localEstoque?.nome ?? null,
          documento: pedido.numero,
          observacoes: `Saída por entrega do pedido ${pedido.numero}`,
          quantidadeMin: estoqueAtual.quantidadeMin != null ? parseFloat(String(estoqueAtual.quantidadeMin)) : null,
        });
      }).catch(() => {});
    }
  }

  return NextResponse.json({ data: updated });
}
