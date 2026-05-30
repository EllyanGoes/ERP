export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const MINUTA_INCLUDE = {
  pedidoVenda: {
    include: {
      cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      itens: {
        include: {
          item: {
            select: {
              id: true, codigo: true, descricao: true,
              unidade: { select: { id: true, sigla: true, nome: true } },
              itemUnidades: {
                where: { isPrincipal: false },
                select: { id: true, fatorConversao: true, unidade: { select: { id: true, sigla: true, nome: true } } },
              },
            },
          },
          minutaItens: {
            where: { minuta: { status: { not: "CANCELADA" } } },
            select: { quantidade: true },
          },
        },
      },
    },
  },
  localEstoque: { select: { id: true, nome: true } },
  motorista:    { select: { id: true, nome: true } },
  itens: {
    include: {
      item: { select: { id: true, codigo: true, descricao: true } },
      unidade: { select: { id: true, sigla: true, nome: true } },
      pedidoVendaItem: { select: { id: true, quantidade: true } },
    },
  },
} as const;

// ── Auto-conclusão do PedidoVenda ────────────────────────────────────────────
// Chamada após uma Minuta ser marcada como ENTREGUE.
// Se TODOS os itens do pedido tiverem saldo zero (qty pedida ≤ qty entregue em minutas ENTREGUE),
// e o pedido estiver em CONFIRMADO, EM_AGENDAMENTO (ou qualquer status não-final),
// o status do PedidoVenda é atualizado para CONCLUIDO automaticamente.
async function checkAndConcludePedido(pedidoVendaId: string) {
  try {
    const pedido = await prisma.pedidoVenda.findUnique({
      where: { id: pedidoVendaId },
      select: {
        id: true,
        status: true,
        itens: {
          select: {
            id: true,
            quantidade: true,
            minutaItens: {
              where: { minuta: { status: "ENTREGUE" } },
              select: { quantidade: true },
            },
          },
        },
      },
    });

    if (!pedido) return;
    // Só conclui se ainda não está num status final
    if (pedido.status === "CONCLUIDO" || pedido.status === "CANCELADO" || pedido.status === "ORCAMENTO") return;

    // Verifica se todos os itens foram totalmente entregues
    const todosEntregues = pedido.itens.every((item) => {
      const qtdPedida   = parseFloat(item.quantidade.toString());
      const qtdEntregue = item.minutaItens.reduce(
        (sum, mi) => sum + parseFloat(mi.quantidade.toString()), 0
      );
      return qtdEntregue >= qtdPedida;
    });

    if (todosEntregues && pedido.itens.length > 0) {
      await prisma.pedidoVenda.update({
        where: { id: pedidoVendaId },
        data:  { status: "CONCLUIDO" },
      });
      console.log(`[Minutas] PedidoVenda ${pedidoVendaId} concluído automaticamente.`);
    }
  } catch (err) {
    // Não propaga — a conclusão do pedido é secundária, não deve derrubar o PATCH da minuta
    console.error("[checkAndConcludePedido]", err);
  }
}

// ── GET /api/comercial/minutas/[id] ──────────────────────────────────────────
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const minuta = await prisma.minuta.findUnique({
      where: { id: params.id },
      include: MINUTA_INCLUDE,
    });
    if (!minuta) return NextResponse.json({ error: "Minuta não encontrada" }, { status: 404 });
    return NextResponse.json({ data: minuta });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── PATCH /api/comercial/minutas/[id] ────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();

    const minuta = await prisma.minuta.findUnique({
      where: { id: params.id },
      include: {
        itens: true,
        localEstoque: { select: { id: true, nome: true } },
      },
    });
    if (!minuta) return NextResponse.json({ error: "Minuta não encontrada" }, { status: 404 });

    const newStatus = body.status as string | undefined;

    // Validate status transitions
    if (newStatus) {
      const validTransitions: Record<string, string[]> = {
        PENDENTE:          ["SAIU_PARA_ENTREGA", "CANCELADA"],
        SAIU_PARA_ENTREGA: ["ENTREGUE"],
        ENTREGUE:          [],
        CANCELADA:         [],
      };
      const allowed = validTransitions[minuta.status] ?? [];
      if (!allowed.includes(newStatus)) {
        return NextResponse.json(
          { error: `Transição inválida: ${minuta.status} → ${newStatus}` },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (body.motoristaId  !== undefined) updateData.motoristaId  = body.motoristaId  || null;
    if (body.placa        !== undefined) updateData.placa        = body.placa        || null;
    if (body.dataEntrega  !== undefined) updateData.dataEntrega  = body.dataEntrega  ? new Date(body.dataEntrega) : null;
    if (body.localEstoqueId !== undefined) updateData.localEstoqueId = body.localEstoqueId || null;
    if (body.observacoes  !== undefined) updateData.observacoes  = body.observacoes  || null;
    if (body.numeroFisico !== undefined) updateData.numeroFisico = body.numeroFisico || null;
    if (body.tipo === "ENTREGA" || body.tipo === "RETIRADA") updateData.tipo = body.tipo;
    if (newStatus)                        updateData.status       = newStatus;

    // ── SAIU_PARA_ENTREGA → gera SAÍDA no estoque ─────────────────────────────
    if (newStatus === "SAIU_PARA_ENTREGA") {
      const localEstoqueId = body.localEstoqueId || minuta.localEstoqueId;
      if (!localEstoqueId) {
        return NextResponse.json(
          { error: "Informe o Local de Estoque para registrar a saída" },
          { status: 400 }
        );
      }

      await prisma.$transaction(async (tx) => {
        // Generate MOV number for the lote
        const year = new Date().getFullYear();
        const seq = await tx.sequencia.upsert({
          where:  { prefixo: "MOV" },
          create: { prefixo: "MOV", ultimo: 1 },
          update: { ultimo: { increment: 1 } },
        });
        const movNumero = `MOV-${year}-${String(seq.ultimo).padStart(4, "0")}`;

        const lote = await tx.loteMovimentacao.create({
          data: {
            numero:      movNumero,
            tipo:        "SAIDA",
            documento:   minuta.numero,
            observacoes: `Saída por minuta ${minuta.numero}`,
          },
        });

        for (const item of minuta.itens) {
          const quantidade = parseFloat(item.quantidade.toString());

          let estoque = await tx.estoqueItem.findFirst({
            where: { itemId: item.itemId, localEstoqueId },
          });
          if (!estoque) {
            estoque = await tx.estoqueItem.create({
              data: { itemId: item.itemId, localEstoqueId, quantidadeAtual: 0, quantidadeMin: 0 },
            });
          }

          const saldoAntes  = parseFloat(estoque.quantidadeAtual.toString());
          const saldoDepois = saldoAntes - quantidade;

          await tx.estoqueItem.update({
            where: { id: estoque.id },
            data:  { quantidadeAtual: saldoDepois },
          });

          await tx.movimentacaoEstoque.create({
            data: {
              itemId:       item.itemId,
              localEstoqueId,
              unidadeId:    item.unidadeId ?? null,
              loteId:       lote.id,
              tipo:         "SAIDA",
              quantidade,
              saldoAntes,
              saldoDepois,
              documento:    minuta.numero,
              observacoes:  `Saída por minuta ${minuta.numero}`,
            },
          });
        }

        // Update the minuta's localEstoqueId if it was provided in body
        await tx.minuta.update({
          where: { id: params.id },
          data:  { ...updateData, localEstoqueId },
        });
      });

      const updated = await prisma.minuta.findUnique({
        where: { id: params.id },
        include: MINUTA_INCLUDE,
      });
      return NextResponse.json({ data: updated });
    }

    // ── Edição de itens (com reconciliação de estoque) ───────────────────────
    // Acionada pela tela de edição (que envia `itens` sem mudar o status).
    // A minuta já baixou o estoque ao nascer (SAIU_PARA_ENTREGA), então ao trocar
    // quantidades/itens/local devolvemos o que estava baixado e baixamos o novo —
    // tudo via saldo líquido por (item + local) para gerar o mínimo de movimentos.
    if (Array.isArray(body.itens)) {
      const novosItens = body.itens as Array<{
        pedidoVendaItemId: string;
        itemId: string;
        quantidade: number;
        quantidadeConvertida?: number | null;
        unidadeId?: string | null;
      }>;
      if (novosItens.length === 0) {
        return NextResponse.json({ error: "Informe ao menos um item com quantidade" }, { status: 400 });
      }

      // Minutas finalizadas (entregue/cancelada) só o administrador edita.
      const isFinal = minuta.status === "ENTREGUE" || minuta.status === "CANCELADA";
      if (isFinal) {
        const session = await getSession();
        if (session?.perfil !== "ADMIN") {
          return NextResponse.json({ error: "Apenas administradores podem editar minutas finalizadas" }, { status: 403 });
        }
      }

      const oldLocal = minuta.localEstoqueId;
      const newLocal = body.localEstoqueId !== undefined ? (body.localEstoqueId || null) : oldLocal;

      // A minuta movimenta estoque apenas quando está em SAIU_PARA_ENTREGA ou ENTREGUE.
      const movimentaEstoque = minuta.status === "SAIU_PARA_ENTREGA" || minuta.status === "ENTREGUE";
      if (movimentaEstoque && !newLocal) {
        return NextResponse.json({ error: "Informe o Local de Estoque para registrar a saída" }, { status: 400 });
      }

      // Saldo líquido por (item + local): devolve as quantidades antigas (+) e baixa as novas (−).
      const net = new Map<string, { itemId: string; localEstoqueId: string; delta: number }>();
      if (movimentaEstoque) {
        for (const it of minuta.itens) {
          if (!oldLocal) continue;
          const key = `${it.itemId}|${oldLocal}`;
          const cur = net.get(key) ?? { itemId: it.itemId, localEstoqueId: oldLocal, delta: 0 };
          cur.delta += parseFloat(it.quantidade.toString());
          net.set(key, cur);
        }
        for (const it of novosItens) {
          const key = `${it.itemId}|${newLocal}`;
          const cur = net.get(key) ?? { itemId: it.itemId, localEstoqueId: newLocal as string, delta: 0 };
          cur.delta -= Number(it.quantidade) || 0;
          net.set(key, cur);
        }
      }

      await prisma.$transaction(async (tx) => {
        // Substitui os itens da minuta
        await tx.minutaItem.deleteMany({ where: { minutaId: params.id } });
        await tx.minutaItem.createMany({
          data: novosItens.map((it) => ({
            minutaId: params.id,
            pedidoVendaItemId: it.pedidoVendaItemId,
            itemId: it.itemId,
            quantidade: it.quantidade,
            quantidadeConvertida: it.quantidadeConvertida ?? null,
            unidadeId: it.unidadeId || null,
          })),
        });

        // Reconcilia o estoque (apenas onde o saldo líquido ≠ 0)
        const ajustes = Array.from(net.values()).filter((n) => Math.abs(n.delta) > 0.0001);
        if (ajustes.length > 0) {
          const year = new Date().getFullYear();
          const seq = await tx.sequencia.upsert({
            where:  { prefixo: "MOV" },
            create: { prefixo: "MOV", ultimo: 1 },
            update: { ultimo: { increment: 1 } },
          });
          const movNumero = `MOV-${year}-${String(seq.ultimo).padStart(4, "0")}`;
          const lote = await tx.loteMovimentacao.create({
            data: {
              numero:      movNumero,
              tipo:        "AJUSTE",
              documento:   minuta.numero,
              observacoes: `Ajuste por edição da minuta ${minuta.numero}`,
            },
          });

          for (const aj of ajustes) {
            let estoque = await tx.estoqueItem.findFirst({
              where: { itemId: aj.itemId, localEstoqueId: aj.localEstoqueId },
            });
            if (!estoque) {
              estoque = await tx.estoqueItem.create({
                data: { itemId: aj.itemId, localEstoqueId: aj.localEstoqueId, quantidadeAtual: 0, quantidadeMin: 0 },
              });
            }
            const saldoAntes  = parseFloat(estoque.quantidadeAtual.toString());
            const saldoDepois = saldoAntes + aj.delta;
            await tx.estoqueItem.update({
              where: { id: estoque.id },
              data:  { quantidadeAtual: saldoDepois },
            });
            await tx.movimentacaoEstoque.create({
              data: {
                itemId:        aj.itemId,
                localEstoqueId: aj.localEstoqueId,
                loteId:        lote.id,
                tipo:          aj.delta > 0 ? "ENTRADA" : "SAIDA",
                quantidade:    Math.abs(aj.delta),
                saldoAntes,
                saldoDepois,
                documento:     minuta.numero,
                observacoes:   `Ajuste por edição da minuta ${minuta.numero}`,
              },
            });
          }
        }

        // Atualiza logística + local de estoque
        await tx.minuta.update({
          where: { id: params.id },
          data:  { ...updateData, localEstoqueId: newLocal },
        });
      });

      const updated = await prisma.minuta.findUnique({
        where: { id: params.id },
        include: MINUTA_INCLUDE,
      });

      // Se a minuta editada está ENTREGUE, reavalia a conclusão do pedido.
      if (minuta.status === "ENTREGUE") await checkAndConcludePedido(minuta.pedidoVendaId);

      return NextResponse.json({ data: updated });
    }

    // ── All other updates (ENTREGUE, CANCELADA, metadata) ────────────────────
    const updated = await prisma.minuta.update({
      where: { id: params.id },
      data:  updateData,
      include: MINUTA_INCLUDE,
    });

    // ── Auto-conclusão do PedidoVenda quando Minuta vai para ENTREGUE ─────────
    if (newStatus === "ENTREGUE") {
      await checkAndConcludePedido(minuta.pedidoVendaId);
    }

    return NextResponse.json({ data: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("[PATCH /api/comercial/minutas/[id]]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── DELETE /api/comercial/minutas/[id] ───────────────────────────────────────
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const minuta = await prisma.minuta.findUnique({ where: { id: params.id } });
    if (!minuta) return NextResponse.json({ error: "Minuta não encontrada" }, { status: 404 });

    if (minuta.status !== "PENDENTE") {
      return NextResponse.json(
        { error: "Só é possível excluir minutas com status PENDENTE" },
        { status: 409 }
      );
    }

    await prisma.minuta.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
