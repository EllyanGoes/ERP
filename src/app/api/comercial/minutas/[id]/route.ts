export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { minutaItensSchema } from "@/lib/validations/minuta";
import { recalcularSaldos } from "@/lib/estoque-saldos";
import { proximaSequenciaDaEmpresa } from "@/lib/empresa";
import { espelharEntregaMinuta } from "@/lib/intragrupo";

// Lançado dentro das transações quando outra requisição mexeu na minuta no meio
// do caminho (duplo clique, duas abas). Aborta a transação e vira HTTP 409.
class ConflictError extends Error {}

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
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

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

    const STATUS_VALIDOS = ["PENDENTE", "SAIU_PARA_ENTREGA", "ENTREGUE", "CANCELADA"] as const;
    const newStatus = body.status as (typeof STATUS_VALIDOS)[number] | undefined;
    if (newStatus !== undefined && !STATUS_VALIDOS.includes(newStatus)) {
      return NextResponse.json({ error: `Status inválido: ${newStatus}` }, { status: 400 });
    }

    // Validate status transitions
    // A tela de edição (que envia `itens`) define qualquer status livremente para
    // corrigir erros — o estoque é reconciliado adiante. As ações rápidas do detalhe
    // (que enviam só `status`) continuam presas ao fluxo PENDENTE→SAIU→ENTREGUE.
    if (newStatus && !Array.isArray(body.itens)) {
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
    // Apenas a ação rápida do detalhe (só `status`). Pela tela de edição (com `itens`)
    // a saída é tratada na reconciliação abaixo, evitando baixa em dobro.
    if (newStatus === "SAIU_PARA_ENTREGA" && !Array.isArray(body.itens)) {
      const localEstoqueId = body.localEstoqueId || minuta.localEstoqueId;
      if (!localEstoqueId) {
        return NextResponse.json(
          { error: "Informe o Local de Estoque para registrar a saída" },
          { status: 400 }
        );
      }

      await prisma.$transaction(async (tx) => {
        // Trava a transição: só UMA requisição move PENDENTE→SAIU_PARA_ENTREGA.
        // Sem isso, duplo clique no "Marcar saída" baixava o estoque duas vezes.
        const claimed = await tx.minuta.updateMany({
          where: { id: params.id, status: "PENDENTE" },
          data:  { status: "SAIU_PARA_ENTREGA" },
        });
        if (claimed.count === 0) {
          throw new ConflictError("A minuta já saiu para entrega (ação duplicada?) — recarregue a página.");
        }

        // Multiempresa: o estoque movimentado é o da empresa DONA da minuta
        // (modo grupo permite operar minutas de outra empresa) — lote, número
        // e movimentações carimbados nela.
        const year = new Date().getFullYear();
        const seqMov = await proximaSequenciaDaEmpresa(minuta.empresaId, "MOV");
        const movNumero = `MOV-${year}-${String(seqMov).padStart(4, "0")}`;

        const lote = await tx.loteMovimentacao.create({
          data: {
            empresaId:   minuta.empresaId,
            numero:      movNumero,
            tipo:        "SAIDA",
            documento:   minuta.numero,
            observacoes: `Saída por minuta ${minuta.numero}`,
          },
        });

        for (const item of minuta.itens) {
          const quantidade = parseFloat(item.quantidade.toString());

          let estoque = await tx.estoqueItem.findFirst({
            where: { empresaId: minuta.empresaId, itemId: item.itemId, localEstoqueId, clienteDonoId: null },
          });
          if (!estoque) {
            estoque = await tx.estoqueItem.create({
              data: { empresaId: minuta.empresaId, itemId: item.itemId, localEstoqueId, quantidadeAtual: 0, quantidadeMin: 0, clienteDonoId: null },
            });
          }

          // decrement atômico: movimentações concorrentes do mesmo item não
          // perdem atualização; os saldos da linha derivam do valor pós-update.
          const atualizado = await tx.estoqueItem.update({
            where: { id: estoque.id },
            data:  { quantidadeAtual: { decrement: quantidade } },
          });
          const saldoDepois = parseFloat(atualizado.quantidadeAtual.toString());
          const saldoAntes  = saldoDepois + quantidade;

          await tx.movimentacaoEstoque.create({
            data: {
              empresaId:    minuta.empresaId,
              itemId:       item.itemId,
              localEstoqueId,
              unidadeId:    item.unidadeId ?? null,
              loteId:       lote.id,
              pedidoVendaItemId: item.pedidoVendaItemId,
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

    // ── Edição completa pela tela de edição (itens + logística + status) ─────
    // Envia sempre `itens`. Como a minuta pode trocar de quantidades, local e status,
    // a reconciliação abaixo devolve o que estava baixado e baixa o novo conforme o
    // status efetivo — tudo por saldo líquido (item + local) p/ gerar o mínimo de movimentos.
    if (Array.isArray(body.itens)) {
      // Valida o que vira movimentação de estoque (ids e quantidades dos itens).
      const parsedItens = minutaItensSchema.safeParse(body.itens);
      if (!parsedItens.success) {
        return NextResponse.json({ error: "Itens inválidos", details: parsedItens.error.flatten() }, { status: 400 });
      }
      const novosItens = parsedItens.data;

      // Edição liberada para qualquer usuário, inclusive em minutas finalizadas
      // (entregue/cancelada): o estoque é reconciliado pelo delta logo abaixo.

      const oldLocal = minuta.localEstoqueId;
      const newLocal = body.localEstoqueId !== undefined ? (body.localEstoqueId || null) : oldLocal;

      // Status efetivo depois da edição (a tela pode alterá-lo livremente).
      const effectiveStatus = newStatus ?? minuta.status;

      // O estoque fica "baixado" quando a minuta está em SAIU_PARA_ENTREGA ou ENTREGUE.
      // A reconciliação abaixo reverte as movimentações atuais da minuta e reaplica
      // a saída conforme o status efetivo (newOut), atualizando as linhas no lugar
      // (sem lançar "Ajuste"). Saiu/Entregue → baixa; Pendente/Cancelada → devolve.
      const newOut = effectiveStatus === "SAIU_PARA_ENTREGA" || effectiveStatus === "ENTREGUE";
      if (newOut && !newLocal) {
        return NextResponse.json({ error: "Informe o Local de Estoque para registrar a saída" }, { status: 400 });
      }

      // Estado desejado de SAÍDA por item (no local efetivo), somando linhas do mesmo item.
      const desejado = new Map<string, { itemId: string; qty: number; unidadeId: string | null; pedidoVendaItemId: string | null }>();
      if (newOut && newLocal) {
        for (const it of novosItens) {
          const cur = desejado.get(it.itemId) ?? { itemId: it.itemId, qty: 0, unidadeId: it.unidadeId ?? null, pedidoVendaItemId: it.pedidoVendaItemId ?? null };
          cur.qty += Number(it.quantidade) || 0;
          if (!cur.unidadeId) cur.unidadeId = it.unidadeId ?? null;
          if (!cur.pedidoVendaItemId) cur.pedidoVendaItemId = it.pedidoVendaItemId ?? null;
          desejado.set(it.itemId, cur);
        }
      }

      await prisma.$transaction(async (tx) => {
        // Lock otimista: a reconciliação abaixo reverte e reaplica o efeito da
        // minuta no estoque a partir do snapshot lido FORA da transação. Se a
        // minuta mudou nesse meio tempo (outra aba/usuário), aborta com 409 em
        // vez de reconciliar sobre dados defasados.
        const claimed = await tx.minuta.updateMany({
          where: { id: params.id, updatedAt: minuta.updatedAt },
          data:  { status: effectiveStatus },
        });
        if (claimed.count === 0) {
          throw new ConflictError("A minuta foi alterada por outra pessoa enquanto você editava — recarregue e tente de novo.");
        }

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

        // ── Reconcilia o estoque ATUALIZANDO as movimentações da própria minuta ──
        // Em vez de lançar uma movimentação de "Ajuste", revertemos o efeito atual
        // da minuta no estoque e reescrevemos a saída com as quantidades novas,
        // reaproveitando a linha de saída de cada item (atualização no lugar). No
        // fim, o saldo corrido de cada (item + local) afetado é recalculado.
        const num = (d: unknown) => parseFloat(String(d));
        const existentes = await tx.movimentacaoEstoque.findMany({
          where: { documento: minuta.numero },
          select: { id: true, itemId: true, localEstoqueId: true, tipo: true, quantidade: true, saldoAntes: true, saldoDepois: true, loteId: true },
        });

        const afetados = new Set<string>(); // "itemId|localId" a recalcular
        const marca = (itemId: string, localId: string | null) => { if (localId) afetados.add(`${itemId}|${localId}`); };

        // 1) Reverte o efeito atual de cada movimentação da minuta no estoque e
        //    reaproveita 1 linha de SAÍDA por item que continua na minuta.
        const reusaveis = new Map<string, string>(); // itemId -> movimentacaoEstoque.id reaproveitada
        let saidaLoteId: string | null = existentes.find((m) => m.tipo === "SAIDA")?.loteId ?? null;

        for (const mv of existentes) {
          if (mv.localEstoqueId) {
            const efeito = mv.tipo === "ENTRADA" ? num(mv.quantidade) : mv.tipo === "SAIDA" ? -num(mv.quantidade) : num(mv.saldoDepois) - num(mv.saldoAntes);
            await tx.estoqueItem.updateMany({
              where: { itemId: mv.itemId, localEstoqueId: mv.localEstoqueId, clienteDonoId: null },
              data:  { quantidadeAtual: { decrement: efeito } },
            });
            marca(mv.itemId, mv.localEstoqueId);
          }
          const reaproveita = newOut && !!newLocal && desejado.has(mv.itemId) && mv.tipo === "SAIDA" && !reusaveis.has(mv.itemId);
          if (reaproveita) {
            reusaveis.set(mv.itemId, mv.id);
          } else {
            await tx.movimentacaoEstoque.delete({ where: { id: mv.id } });
          }
        }

        // 2) Aplica a saída nova: baixa o estoque e grava/atualiza 1 movimentação por item.
        if (newOut && newLocal) {
          for (const d of Array.from(desejado.values())) {
            if (!(d.qty > 0)) continue;
            let estoque = await tx.estoqueItem.findFirst({ where: { empresaId: minuta.empresaId, itemId: d.itemId, localEstoqueId: newLocal, clienteDonoId: null } });
            if (!estoque) {
              estoque = await tx.estoqueItem.create({ data: { empresaId: minuta.empresaId, itemId: d.itemId, localEstoqueId: newLocal, quantidadeAtual: 0, quantidadeMin: 0, clienteDonoId: null } });
            }
            await tx.estoqueItem.update({ where: { id: estoque.id }, data: { quantidadeAtual: { decrement: d.qty } } });
            marca(d.itemId, newLocal);

            const reusedId = reusaveis.get(d.itemId);
            if (reusedId) {
              await tx.movimentacaoEstoque.update({
                where: { id: reusedId },
                data: {
                  localEstoqueId:    newLocal,
                  unidadeId:         d.unidadeId,
                  pedidoVendaItemId: d.pedidoVendaItemId,
                  tipo:              "SAIDA",
                  quantidade:        d.qty,
                  documento:         minuta.numero,
                  observacoes:       `Saída por minuta ${minuta.numero}`,
                },
              });
            } else {
              if (!saidaLoteId) {
                const year = new Date().getFullYear();
                const seqMov = await proximaSequenciaDaEmpresa(minuta.empresaId, "MOV");
                const lote = await tx.loteMovimentacao.create({ data: { empresaId: minuta.empresaId, numero: `MOV-${year}-${String(seqMov).padStart(4, "0")}`, tipo: "SAIDA", documento: minuta.numero, observacoes: `Saída por minuta ${minuta.numero}` } });
                saidaLoteId = lote.id;
              }
              await tx.movimentacaoEstoque.create({
                data: {
                  empresaId:         minuta.empresaId,
                  itemId:            d.itemId,
                  localEstoqueId:    newLocal,
                  unidadeId:         d.unidadeId,
                  pedidoVendaItemId: d.pedidoVendaItemId,
                  loteId:            saidaLoteId,
                  tipo:              "SAIDA",
                  quantidade:        d.qty,
                  saldoAntes:        0,
                  saldoDepois:       0,
                  documento:         minuta.numero,
                  observacoes:       `Saída por minuta ${minuta.numero}`,
                },
              });
            }
          }
        }

        // 3) Recalcula a cadeia de saldos de cada (item + local) afetado.
        for (const key of Array.from(afetados)) {
          const [itemId, localId] = key.split("|");
          await recalcularSaldos(tx, itemId, localId, null);
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

      // Se a minuta ficou (ou continuou) ENTREGUE, reavalia a conclusão do pedido.
      if (minuta.status === "ENTREGUE" || effectiveStatus === "ENTREGUE") {
        await checkAndConcludePedido(minuta.pedidoVendaId);
        await espelharEntregaMinuta(params.id); // intragrupo: entrada na compradora
      }

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
      await espelharEntregaMinuta(params.id); // intragrupo: entrada na compradora
    }

    return NextResponse.json({ data: updated });
  } catch (err: unknown) {
    if (err instanceof ConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("[PATCH /api/comercial/minutas/[id]]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── DELETE /api/comercial/minutas/[id] ───────────────────────────────────────
// Exclui a minuta. Minutas que já saíram/entregaram movimentaram estoque —
// excluí-las exige ADMIN e ESTORNA a saída (devolve o estoque). PENDENTE (sem
// movimentação) continua excluível por qualquer usuário.
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  try {
    const minuta = await prisma.minuta.findUnique({
      where: { id: params.id },
      select: { id: true, numero: true, status: true },
    });
    if (!minuta) return NextResponse.json({ error: "Minuta não encontrada" }, { status: 404 });

    if (minuta.status !== "PENDENTE" && auth.session.perfil !== "ADMIN") {
      return NextResponse.json(
        { error: "Apenas administradores podem excluir minutas que já saíram ou foram entregues." },
        { status: 403 },
      );
    }

    await prisma.$transaction(async (tx) => {
      const num = (d: unknown) => parseFloat(String(d));

      // 1) Estorna no estoque o efeito das movimentações da minuta e as remove.
      const movs = await tx.movimentacaoEstoque.findMany({
        where: { documento: minuta.numero },
        select: { id: true, itemId: true, localEstoqueId: true, tipo: true, quantidade: true, saldoAntes: true, saldoDepois: true, loteId: true },
      });
      const afetados = new Set<string>(); // "itemId|localId" a recalcular
      const loteIds = new Set<string>();
      for (const mv of movs) {
        if (mv.localEstoqueId) {
          const efeito = mv.tipo === "ENTRADA" ? num(mv.quantidade) : mv.tipo === "SAIDA" ? -num(mv.quantidade) : num(mv.saldoDepois) - num(mv.saldoAntes);
          await tx.estoqueItem.updateMany({
            where: { itemId: mv.itemId, localEstoqueId: mv.localEstoqueId, clienteDonoId: null },
            data:  { quantidadeAtual: { decrement: efeito } },
          });
          afetados.add(`${mv.itemId}|${mv.localEstoqueId}`);
        }
        if (mv.loteId) loteIds.add(mv.loteId);
      }
      if (movs.length > 0) {
        await tx.movimentacaoEstoque.deleteMany({ where: { id: { in: movs.map((m) => m.id) } } });
      }

      // 2) Remove a minuta (MinutaItem sai em cascata).
      await tx.minuta.delete({ where: { id: params.id } });

      // 3) Remove os lotes que ficaram sem nenhuma movimentação.
      for (const loteId of Array.from(loteIds)) {
        const restante = await tx.movimentacaoEstoque.count({ where: { loteId } });
        if (restante === 0) await tx.loteMovimentacao.delete({ where: { id: loteId } });
      }

      // 4) Recalcula a cadeia de saldos de cada (item + local) afetado.
      for (const key of Array.from(afetados)) {
        const [itemId, localId] = key.split("|");
        await recalcularSaldos(tx, itemId, localId, null);
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
