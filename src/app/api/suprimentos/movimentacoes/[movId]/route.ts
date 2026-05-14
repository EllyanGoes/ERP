export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

type Ctx = { params: { movId: string } };

// ── PATCH — edit safe metadata fields ────────────────────────────────────────
// Allows changing: documento, observacoes, unidadeId
// Does NOT change tipo/quantidade (would break stock integrity)
const patchSchema = z.object({
  documento:   z.string().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  unidadeId:   z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  try {
    const updated = await prisma.movimentacaoEstoque.update({
      where: { id: params.movId },
      data: {
        documento:   parsed.data.documento   ?? undefined,
        observacoes: parsed.data.observacoes ?? undefined,
        unidadeId:   parsed.data.unidadeId   !== undefined ? (parsed.data.unidadeId || null) : undefined,
      },
      select: {
        id: true, tipo: true, quantidade: true,
        saldoAntes: true, saldoDepois: true,
        documento: true, observacoes: true, createdAt: true,
        unidade: { select: { id: true, sigla: true, nome: true } },
      },
    });
    return NextResponse.json({ data: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── DELETE — reverse stock and remove movement ────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    await prisma.$transaction(async (tx) => {
      // Load the movement
      const mov = await tx.movimentacaoEstoque.findUniqueOrThrow({
        where: { id: params.movId },
        select: { itemId: true, localEstoqueId: true, tipo: true, quantidade: true, valorUnitario: true },
      });

      // Reverse the stock delta
      if (mov.localEstoqueId) {
        const estoque = await tx.estoqueItem.findFirst({
          where: { itemId: mov.itemId, localEstoqueId: mov.localEstoqueId },
        });

        if (estoque) {
          const qty = parseFloat(mov.quantidade.toString());
          // ENTRADA was added → subtract; SAIDA was subtracted → add back
          const delta = mov.tipo === "ENTRADA" ? -qty : qty;
          await tx.estoqueItem.update({
            where: { id: estoque.id },
            data:  { quantidadeAtual: { increment: delta } },
          });
        }
      }

      // If it was an ENTRADA with a cost, recalculate precoCusto (CMPM)
      // Simple approach: if remaining stock > 0 keep last precoCusto, else zero it
      if (mov.tipo === "ENTRADA" && mov.valorUnitario) {
        const allEstoque = await tx.estoqueItem.findMany({ where: { itemId: mov.itemId } });
        const totalQty = allEstoque.reduce((s, e) => s + parseFloat(e.quantidadeAtual.toString()), 0);
        if (totalQty <= 0) {
          await tx.item.update({ where: { id: mov.itemId }, data: { precoCusto: null } });
        }
      }

      // Delete the movement record
      await tx.movimentacaoEstoque.delete({ where: { id: params.movId } });
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
