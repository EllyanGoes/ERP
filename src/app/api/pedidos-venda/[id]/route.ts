export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pedidoVendaSchema } from "@/lib/validations/pedido-venda";
import { generateDocNumber } from "@/lib/utils";
import { recalcPedidoValorTotal, getItensPendentesEntrega } from "@/lib/pedido-totais";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const pedido = await prisma.pedidoVenda.findUnique({
    where: { id: params.id },
    include: {
      cliente: true,
      itens: {
        include: {
          item: {
            include: {
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
      contasReceber: true,
      minutas: {
        include: {
          localEstoque: { select: { id: true, nome: true } },
          itens: {
            select: {
              id: true,
              pedidoVendaItemId: true,
              itemId: true,
              quantidade: true,
              quantidadeConvertida: true,
              unidade: { select: { id: true, sigla: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  return NextResponse.json({ data: pedido });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const parsed = pedidoVendaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { itens, ...pedidoData } = parsed.data;
  const valorProdutos = itens.reduce((sum, i) => sum + i.valorTotal, 0);
  const valorTotal = valorProdutos - (pedidoData.valorDesconto ?? 0) + (pedidoData.valorFrete ?? 0);

  // Comodato (saída) editado como rascunho: linhas com `id` já existem (update),
  // sem `id` são novas (create), e as que sumiram são removidas. Lido do corpo
  // bruto porque o schema do pedido descarta chaves desconhecidas.
  const comodatoRaw: any[] = Array.isArray(body.comodato) ? body.comodato : [];
  const comodato = comodatoRaw
    .filter((c) => c && typeof c.itemId === "string" && c.itemId && Number(c.quantidade) > 0)
    .map((c) => ({
      id:            typeof c.id === "string" && c.id ? c.id : null,
      itemId:        c.itemId as string,
      quantidade:    Number(c.quantidade),
      valorUnitario: c.valorUnitario != null ? Number(c.valorUnitario) : null,
      documento:     typeof c.documento === "string" && c.documento.trim() ? c.documento.trim() : null,
    }));

  // Existing items + how much of each is already committed to a non-cancelled
  // minuta (delivery note). Rows with minutas must NOT be deleted (FK Restrict)
  // nor reduced below what was already minutado — that protects deliveries.
  const existing = await prisma.pedidoVendaItem.findMany({
    where: { pedidoVendaId: params.id },
    include: {
      item: { select: { descricao: true } },
      minutaItens: { where: { minuta: { status: { not: "CANCELADA" } } }, select: { quantidade: true } },
    },
  });

  const EPS = 1e-6;
  const minutadoByRow = new Map<string, number>();
  const minutadoByItem = new Map<string, number>();
  const descByItem = new Map<string, string>();
  for (const e of existing) {
    const m = e.minutaItens.reduce((s, mi) => s + Number(mi.quantidade), 0);
    minutadoByRow.set(e.id, m);
    minutadoByItem.set(e.itemId, (minutadoByItem.get(e.itemId) ?? 0) + m);
    descByItem.set(e.itemId, e.item.descricao);
  }

  const incomingQtyByItem = new Map<string, number>();
  for (const it of itens) {
    incomingQtyByItem.set(it.itemId, (incomingQtyByItem.get(it.itemId) ?? 0) + it.quantidade);
  }

  // Block removing/reducing any product below its already-minutado quantity.
  const conflitos: string[] = [];
  for (const [itemId, minutado] of Array.from(minutadoByItem)) {
    if (minutado <= 0) continue;
    const novaQtd = incomingQtyByItem.get(itemId) ?? 0;
    if (novaQtd + EPS < minutado) {
      conflitos.push(`${descByItem.get(itemId) ?? itemId} (minutado: ${minutado}, novo: ${novaQtd})`);
    }
  }
  if (conflitos.length > 0) {
    return NextResponse.json(
      {
        error:
          "Não é possível remover ou reduzir itens que já têm minutas: " +
          conflitos.join("; ") +
          ". Cancele as minutas correspondentes antes de alterar.",
      },
      { status: 409 },
    );
  }

  const mapLine = (item: (typeof itens)[number]) => ({
    itemId: item.itemId,
    quantidade: item.quantidade,
    precoUnitario: item.precoUnitario,
    desconto: item.desconto ?? 0,
    valorTotal: item.valorTotal,
  });

  try {
    const pedido = await prisma.$transaction(async (tx) => {
      await tx.pedidoVenda.update({
        where: { id: params.id },
        data: {
          ...pedidoData,
          valorProdutos,
          valorTotal,
          dataEmissao: pedidoData.dataEmissao ? new Date(pedidoData.dataEmissao) : new Date(),
          dataEntrega: pedidoData.dataEntrega ? new Date(pedidoData.dataEntrega) : null,
        },
      });

      // Reconcile items: update existing rows in place (FK-safe), create new
      // lines, and delete only rows that have no minutas attached.
      const allItemIds = new Set<string>([...existing.map((e) => e.itemId), ...itens.map((i) => i.itemId)]);
      for (const itemId of Array.from(allItemIds)) {
        // Rows WITH minutas first, so they get updated (kept), never deleted.
        const exRows = existing
          .filter((e) => e.itemId === itemId)
          .sort((a, b) => (minutadoByRow.get(b.id) ?? 0) - (minutadoByRow.get(a.id) ?? 0));
        const inLines = itens.filter((i) => i.itemId === itemId);
        const pairCount = Math.min(exRows.length, inLines.length);

        for (let k = 0; k < pairCount; k++) {
          await tx.pedidoVendaItem.update({ where: { id: exRows[k].id }, data: mapLine(inLines[k]) });
        }
        for (let k = pairCount; k < inLines.length; k++) {
          await tx.pedidoVendaItem.create({ data: { pedidoVendaId: params.id, ...mapLine(inLines[k]) } });
        }
        for (let k = pairCount; k < exRows.length; k++) {
          if ((minutadoByRow.get(exRows[k].id) ?? 0) > 0) throw new Error("CONFLICT_MINUTA");
          await tx.pedidoVendaItem.delete({ where: { id: exRows[k].id } });
        }
      }

      // Reconcilia o comodato (rascunho) deste pedido: atualiza as linhas que
      // continuaram, cria as novas e remove as que saíram. Só mexe nas
      // movimentações amarradas a este pedido.
      const existingComodato = await tx.movimentacaoComodato.findMany({
        where: { pedidoVendaId: params.id },
        select: { id: true },
      });
      const existingComodatoIds = new Set(existingComodato.map((m) => m.id));
      const incomingComodatoIds = new Set(comodato.filter((c) => c.id).map((c) => c.id as string));
      const dataMovEdit = pedidoData.dataEmissao ? new Date(pedidoData.dataEmissao) : new Date();

      // valorUnitario obrigatório: quando não informado, usa o preço de venda do item.
      const semValor = comodato.filter((c) => c.valorUnitario == null).map((c) => c.itemId);
      const precos = semValor.length
        ? await tx.item.findMany({ where: { id: { in: semValor } }, select: { id: true, precoVenda: true } })
        : [];
      const precoMap = new Map(precos.map((p) => [p.id, Number(p.precoVenda)]));

      const comodatoParaRemover = existingComodato.filter((m) => !incomingComodatoIds.has(m.id)).map((m) => m.id);
      if (comodatoParaRemover.length > 0) {
        await tx.movimentacaoComodato.deleteMany({ where: { id: { in: comodatoParaRemover } } });
      }
      for (const c of comodato) {
        const valor = c.valorUnitario ?? precoMap.get(c.itemId) ?? 0;
        if (c.id && existingComodatoIds.has(c.id)) {
          await tx.movimentacaoComodato.update({
            where: { id: c.id },
            data: { itemId: c.itemId, quantidade: c.quantidade, valorUnitario: valor, documento: c.documento },
          });
        } else {
          await tx.movimentacaoComodato.create({
            data: {
              clienteId:     pedidoData.clienteId,
              itemId:        c.itemId,
              tipo:          "SAIDA" as const,
              quantidade:    c.quantidade,
              valorUnitario: valor,
              origem:        "AUTOMATICO" as const,
              pedidoVendaId: params.id,
              data:          dataMovEdit,
              documento:     c.documento,
            },
          });
        }
      }

      // O comodato entra no total. Recalcula a partir dos itens já reconciliados
      // + comodato atualizado.
      await recalcPedidoValorTotal(tx, params.id);

      return tx.pedidoVenda.findUnique({
        where: { id: params.id },
        include: { cliente: true, itens: { include: { item: true } } },
      });
    });

    return NextResponse.json({ data: pedido });
  } catch (err) {
    if (err instanceof Error && err.message === "CONFLICT_MINUTA") {
      return NextResponse.json(
        { error: "Não é possível alterar este pedido: há itens com minutas que seriam removidos. Cancele as minutas primeiro." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Erro ao salvar pedido. Verifique se há minutas vinculadas aos itens." },
      { status: 400 },
    );
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { status } = body as { status?: string };
  if (!status) return NextResponse.json({ error: "status é obrigatório" }, { status: 400 });

  const valid = ["ORCAMENTO", "CONFIRMADO", "EM_AGENDAMENTO", "CONCLUIDO", "CANCELADO"];
  if (!valid.includes(status)) return NextResponse.json({ error: "Status inválido" }, { status: 400 });

  // Não permite concluir enquanto houver material pendente de entrega
  // (qtd pedida ainda não totalmente coberta por minutas ENTREGUE).
  if (status === "CONCLUIDO") {
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

  const pedido = await prisma.pedidoVenda.update({
    where: { id: params.id },
    data: { status: status as never },
    select: { id: true, status: true },
  });
  return NextResponse.json({ data: pedido });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await prisma.pedidoVenda.update({ where: { id: params.id }, data: { status: "CANCELADO" } });
  return NextResponse.json({ data: { ok: true } });
}
