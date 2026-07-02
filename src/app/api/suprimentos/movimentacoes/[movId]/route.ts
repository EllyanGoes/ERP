export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { recalcularSaldos } from "@/lib/estoque-saldos";
import { zerarCustoEmpresaSeSemEstoque } from "@/lib/custo-empresa";
import { respostaSaldoNegativo, SaldoNegativoError } from "@/lib/estoque-guard";
import { recontabilizarLoteMovimentacao } from "@/lib/contabilidade";
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
  const auth = await requireModulo("almoxarifado");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  try {
    const { documento, observacoes, unidadeId, quantidade, valorUnitario, dataMovimentacao } = parsed.data;

    // Lote da movimentação — pós-commit re-sincroniza o contábil do lote
    // (ajuste/transferência) para o razão não ficar defasado após a edição.
    let loteIdAfetado: string | null = null;

    // If quantity change requested, do it in a transaction (delta-based)
    if (quantidade !== undefined) {
      await prisma.$transaction(async (tx) => {
        const mov = await tx.movimentacaoEstoque.findUniqueOrThrow({
          where: { id: params.movId },
          select: { itemId: true, localEstoqueId: true, tipo: true, quantidade: true, loteId: true, clienteDonoId: true },
        });
        loteIdAfetado = mov.loteId;

        const oldQty = parseFloat(mov.quantidade.toString());
        const newQty = quantidade;
        const delta  = newQty - oldQty;

        // Adjust stock balance
        if (mov.localEstoqueId && delta !== 0) {
          const sign = mov.tipo === "ENTRADA" ? 1 : -1;
          await tx.estoqueItem.updateMany({
            where: { itemId: mov.itemId, localEstoqueId: mov.localEstoqueId, clienteDonoId: mov.clienteDonoId },
            data:  { quantidadeAtual: { increment: sign * delta } },
          });
          // Guard de saldo: o ajuste não pode deixar o saldo negativo (reduzir
          // uma ENTRADA já consumida / aumentar uma SAÍDA além do saldo).
          const ei = await tx.estoqueItem.findFirst({
            where: { itemId: mov.itemId, localEstoqueId: mov.localEstoqueId, clienteDonoId: mov.clienteDonoId },
            select: { quantidadeAtual: true, item: { select: { descricao: true } } },
          });
          const saldoDepois = ei ? parseFloat(String(ei.quantidadeAtual)) : 0;
          if (saldoDepois < 0) {
            throw new SaldoNegativoError([{
              itemId: mov.itemId,
              descricao: ei?.item?.descricao ?? mov.itemId,
              saldoAtual: saldoDepois - sign * delta,
              saldoDepois,
            }]);
          }
        }

        // Update movement record (saldoAntes/saldoDepois são recalculados abaixo)
        await tx.movimentacaoEstoque.update({
          where: { id: params.movId },
          data: {
            quantidade: newQty,
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

        // Recalcula a cadeia de saldos do (item + local) para as linhas seguintes
        // não ficarem com o "Saldo Depois" defasado após a edição.
        if (mov.localEstoqueId) {
          await recalcularSaldos(tx, mov.itemId, mov.localEstoqueId, mov.clienteDonoId);
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
      const mov = await prisma.movimentacaoEstoque.findUnique({ where: { id: params.movId }, select: { loteId: true } });
      loteIdAfetado = mov?.loteId ?? null;
      if (dataMovimentacao !== undefined && mov?.loteId) {
        await prisma.loteMovimentacao.update({
          where: { id: mov.loteId },
          data:  { dataMovimentacao: dataMovimentacao ? new Date(dataMovimentacao) : null },
        });
      }
    }

    // Pós-commit: re-sincroniza o contábil do lote (valor/data/quantidade mudam
    // o lançamento de ajuste/transferência). Best-effort com log.
    if (loteIdAfetado) {
      await recontabilizarLoteMovimentacao(loteIdAfetado).catch((e) => {
        console.error("[PATCH movimentacao] recontabilizarLoteMovimentacao falhou:", e);
      });
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
    if (err instanceof SaldoNegativoError) return respostaSaldoNegativo(err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── DELETE — reverse stock and remove movement ────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("almoxarifado");
  if (!auth.ok) return auth.response;

  try {
    let loteIdAfetado: string | null = null;
    await prisma.$transaction(async (tx) => {
      // Load the movement
      const mov = await tx.movimentacaoEstoque.findUniqueOrThrow({
        where: { id: params.movId },
        select: { itemId: true, empresaId: true, localEstoqueId: true, tipo: true, quantidade: true, valorUnitario: true, clienteDonoId: true, loteId: true },
      });
      loteIdAfetado = mov.loteId;

      // Reverse the stock delta
      if (mov.localEstoqueId) {
        const estoque = await tx.estoqueItem.findFirst({
          where: { itemId: mov.itemId, localEstoqueId: mov.localEstoqueId, clienteDonoId: mov.clienteDonoId },
        });

        if (estoque) {
          const qty = parseFloat(mov.quantidade.toString());
          // ENTRADA was added → subtract; SAIDA was subtracted → add back
          const delta = mov.tipo === "ENTRADA" ? -qty : qty;
          const atualizado = await tx.estoqueItem.update({
            where: { id: estoque.id },
            data:  { quantidadeAtual: { increment: delta } },
          });
          // Guard de saldo: reverter uma ENTRADA já consumida deixaria o saldo
          // negativo — bloqueia (corrija por inventário/estorno das saídas antes).
          const saldoDepois = parseFloat(String(atualizado.quantidadeAtual));
          if (saldoDepois < 0) {
            const prod = await tx.item.findUnique({ where: { id: mov.itemId }, select: { descricao: true } });
            throw new SaldoNegativoError([{
              itemId: mov.itemId,
              descricao: prod?.descricao ?? mov.itemId,
              saldoAtual: saldoDepois - delta,
              saldoDepois,
            }]);
          }
        }
      }

      // If it was an ENTRADA with a cost, recalculate precoCusto (CMPM)
      // Simple approach: if remaining stock > 0 keep last precoCusto, else zero it
      if (mov.tipo === "ENTRADA" && mov.valorUnitario) {
        const allEstoque = await tx.estoqueItem.findMany({ where: { itemId: mov.itemId, clienteDonoId: null } });
        const totalQty = allEstoque.reduce((s, e) => s + parseFloat(e.quantidadeAtual.toString()), 0);
        if (totalQty <= 0) {
          await tx.item.update({ where: { id: mov.itemId }, data: { precoCusto: null } });
        }
        // Custo por empresa: zera o da empresa da movimentação se o estoque dela acabou.
        await zerarCustoEmpresaSeSemEstoque(tx, mov.empresaId, mov.itemId);
      }

      // Delete the movement record
      await tx.movimentacaoEstoque.delete({ where: { id: params.movId } });
    });

    // Pós-commit: re-sincroniza o contábil do lote (a exclusão muda o lançamento
    // de ajuste/transferência). Best-effort com log.
    if (loteIdAfetado) {
      await recontabilizarLoteMovimentacao(loteIdAfetado).catch((e) => {
        console.error("[DELETE movimentacao] recontabilizarLoteMovimentacao falhou:", e);
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof SaldoNegativoError) return respostaSaldoNegativo(err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
