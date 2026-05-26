export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

type Ctx = { params: { movId: string } };

// ── PATCH — edit movement fields ─────────────────────────────────────────────
const patchSchema = z.object({
  documento:        z.string().nullable().optional(),
  observacoes:      z.string().nullable().optional(),
  unidadeId:        z.string().nullable().optional(),
  // Full edit (SALDO-INICIAL only):
  quantidade:       z.coerce.number().positive().optional(),  // new total qty (base unit)
  valorUnitario:    z.coerce.number().min(0).nullable().optional(),
  dataMovimentacao: z.string().nullable().optional(),         // ISO string → update lote
});

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  try {
    const { documento, observacoes, unidadeId, quantidade, valorUnitario, dataMovimentacao } = parsed.data;

    // If quantity change requested, do it in a transaction (delta-based)
    if (quantidade !== undefined) {
      await prisma.$transaction(async (tx) => {
        const mov = await tx.movimentacaoEstoque.findUniqueOrThrow({
          where: { id: params.movId },
          select: { itemId: true, localEstoqueId: true, tipo: true, quantidade: true, loteId: true },
        });

        const oldQty = parseFloat(mov.quantidade.toString());
        const newQty = quantidade;
        const delta  = newQty - oldQty;

        // Adjust stock balance
        if (mov.localEstoqueId && delta !== 0) {
          const sign = mov.tipo === "ENTRADA" ? 1 : -1;
          await tx.estoqueItem.updateMany({
            where: { itemId: mov.itemId, localEstoqueId: mov.localEstoqueId },
            data:  { quantidadeAtual: { increment: sign * delta } },
          });
        }

        // Update movement record
        await tx.movimentacaoEstoque.update({
          where: { id: params.movId },
          data: {
            quantidade: newQty,
            saldoDepois: { increment: mov.tipo === "ENTRADA" ? delta : -delta },
            ...(documento   !== undefined && { documento:   documento   ?? null }),
            ...(observacoes !== undefined && { observacoes: observacoes ?? null }),
            ...(unidadeId   !== undefined && { unidadeId:   unidadeId   || null }),
            ...(valorUnitario !== undefined && { valorUnitario: valorUnitario ?? null }),
          },
        });

        // Update lote dataMovimentacao if provided
        if (dataMovimentacao !== undefined && mov.loteId) {
          await tx.loteMovimentacao.update({
            where: { id: mov.loteId },
            data:  { dataMovimentacao: dataMovimentacao ? new Date(dataMovimentacao) : null },
          });
        }
      });
    } else {
      // Metadata-only update (no quantity change)
      await prisma.movimentacaoEstoque.update({
        where: { id: params.movId },
        data: {
          ...(documento     !== undefined && { documento:     documento     ?? null }),
          ...(observacoes   !== undefined && { observacoes:   observacoes   ?? null }),
          ...(unidadeId     !== undefined && { unidadeId:     unidadeId     || null }),
          ...(valorUnitario !== undefined && { valorUnitario: valorUnitario ?? null }),
        },
      });

      // Update lote date if provided
      if (dataMovimentacao !== undefined) {
        const mov = await prisma.movimentacaoEstoque.findUnique({ where: { id: params.movId }, select: { loteId: true } });
        if (mov?.loteId) {
          await prisma.loteMovimentacao.update({
            where: { id: mov.loteId },
            data:  { dataMovimentacao: dataMovimentacao ? new Date(dataMovimentacao) : null },
          });
        }
      }
    }

    const updated = await prisma.movimentacaoEstoque.findUnique({
      where: { id: params.movId },
      select: {
        id: true, tipo: true, quantidade: true,
        saldoAntes: true, saldoDepois: true,
        documento: true, observacoes: true, createdAt: true,
        localEstoqueId: true, valorUnitario: true,
        lote: { select: { dataMovimentacao: true } },
        localEstoque: { select: { id: true, nome: true, filial: { select: { id: true, razaoSocial: true } } } },
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
