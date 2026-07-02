export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { reverterEExcluirConferencias, tratarContasPagarDosPedidos, ContaPagarComBaixaError } from "@/lib/compras-cascade";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  const record = await prisma.pedidoCompra.findUnique({
    where: { id: params.id },
    include: {
      empresa: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      fornecedor: {
        select: {
          id: true, razaoSocial: true, nomeFantasia: true,
          cpfCnpj: true, contato: true, email: true,
        },
      },
      cotacao: {
        select: {
          id: true, numero: true, nome: true,
          necessidade: {
            select: {
              id: true,
              numero: true,
              solicitante: true,
              justificativa: true,
              motivo: true,
              centroCusto: { select: { nome: true } },
              localEstoque: { select: { nome: true } },
              itens: {
                select: {
                  quantidade: true,
                  item: { select: { descricao: true } },
                },
              },
            },
          },
        },
      },
      itens: {
        include: { item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } } },
      },
      conferencia: { select: { id: true, numero: true, status: true } },
      contasPagar: { orderBy: [{ parcelaNumero: "asc" }, { dataVencimento: "asc" }] },
      necessidade: {
        select: {
          id: true, numero: true, solicitante: true,
          justificativa: true,
          motivo: true,
          centroCusto:  { select: { nome: true } },
          localEstoque: { select: { nome: true } },
          setor:        { select: { nome: true } },
        },
      },
    },
  });

  if (!record) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  // Fetch CotacaoFornecedor to get proposal details — fallback to PedidoCompra own fields for manual PCs
  let cotacaoFornecedor = null;
  if (record.cotacaoId && record.fornecedorId) {
    const allCfs = await prisma.cotacaoFornecedor.findMany({
      where: { cotacaoId: record.cotacaoId },
      orderBy: { id: "asc" },
    });
    const cfIndex = allCfs.findIndex((cf) => cf.fornecedorId === record.fornecedorId);
    const cf = allCfs[cfIndex];
    if (cf) cotacaoFornecedor = { ...cf, propostaNumero: cfIndex + 1 };
  }

  // For manual PCs (no cotação), build cotacaoFornecedor-shaped object from PC own fields
  if (!cotacaoFornecedor) {
    cotacaoFornecedor = {
      propostaNumero: 1,
      frete:              record.frete,
      tipoFrete:          record.tipoFrete,
      desconto:           record.desconto,
      vrDesconto:         record.vrDesconto,
      despesas:           record.despesas,
      seguro:             record.seguro,
      condicoesPagamento: record.condicoesPagamento,
      prazoEntregaDias:   null,
    };
  }

  return NextResponse.json({ data: { ...record, cotacaoFornecedor } });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const pedidoId = params.id;

  if (body.edit === true) {
    // Full edit mode: delete all existing items, create new ones, update all fields
    const itens: Array<{
      itemId: string; quantidade: number; precoUnitario: number; desconto?: number | null;
      situacao?: string; unidadeId?: string | null;
      tesId?: string | null; centroCustoId?: string | null; compoeCusto?: boolean | null;
    }> = body.itens ?? [];

    const subtotal = itens.reduce((s, it) => {
      const situacao = it.situacao ?? "CONSIDERA";
      if (situacao !== "CONSIDERA") return s;
      const bruto = (Number(it.quantidade) || 0) * (Number(it.precoUnitario) || 0);
      const pct   = Number(it.desconto) || 0;
      return s + bruto - (bruto * pct) / 100;
    }, 0);

    const descontoVal  = Number(body.desconto)  || 0;
    const freteVal     = Number(body.frete)      || 0;
    const despesasVal  = Number(body.despesas)   || 0;
    const seguroVal    = Number(body.seguro)      || 0;
    const vrDescontoCalc = (subtotal * descontoVal) / 100;
    const valorTotal   = subtotal - vrDescontoCalc + freteVal + despesasVal + seguroVal;

    const record = await prisma.$transaction(async (tx) => {
      // Preserva os campos de classificação da linha (TES / centro de custo /
      // compõe-custo / unidade) ao recriar os itens: o form de edição não envia
      // todos eles — sem isso a edição APAGAVA a herança usada pela entrada.
      const anteriores = await tx.pedidoCompraItem.findMany({
        where: { pedidoId },
        select: { itemId: true, unidadeId: true, tesId: true, centroCustoId: true, compoeCusto: true },
      });
      const anteriorPorItem = new Map(anteriores.map((a) => [a.itemId, a]));

      await tx.pedidoCompraItem.deleteMany({ where: { pedidoId } });

      await tx.pedidoCompraItem.createMany({
        data: itens.map((it) => {
          const qtd    = Number(it.quantidade) || 0;
          const preco  = Number(it.precoUnitario) || 0;
          const pct    = Number(it.desconto) || 0;
          const bruto  = qtd * preco;
          const prev   = anteriorPorItem.get(it.itemId);
          return {
            pedidoId,
            itemId:        it.itemId,
            unidadeId:     it.unidadeId !== undefined ? (it.unidadeId || null) : (prev?.unidadeId ?? null),
            tesId:         it.tesId !== undefined ? (it.tesId || null) : (prev?.tesId ?? null),
            centroCustoId: it.centroCustoId !== undefined ? (it.centroCustoId || null) : (prev?.centroCustoId ?? null),
            compoeCusto:   it.compoeCusto !== undefined ? (it.compoeCusto ?? null) : (prev?.compoeCusto ?? null),
            quantidade:    qtd,
            precoUnitario: preco,
            valorTotal:    bruto - (bruto * pct) / 100,
            situacao:      (it.situacao ?? "CONSIDERA") as string,
            desconto:      pct || null,
          };
        }),
      });

      return tx.pedidoCompra.update({
        where: { id: pedidoId },
        data: {
          fornecedorId:        body.fornecedorId       || undefined,
          contato:             body.contato            ?? null,
          email:               body.email              ?? null,
          frete:               freteVal                || null,
          tipoFrete:           body.tipoFrete          || null,
          desconto:            descontoVal             || null,
          vrDesconto:          vrDescontoCalc          || null,
          despesas:            despesasVal             || null,
          seguro:              seguroVal               || null,
          condicoesPagamento:  body.condicoesPagamento || null,
          dataEntregaPrevista: body.dataEntregaPrevista ? new Date(body.dataEntregaPrevista) : null,
          observacoes:         body.observacoes        || null,
          descricao:           body.descricao          ?? null,
          valorTotal,
        },
      });
    });

    return NextResponse.json({ data: record });
  }

  // Vincular / desvincular SC (necessidade)
  if (body.vincularNecessidade !== undefined) {
    const necessidadeId = body.vincularNecessidade as string | null;
    const record = await prisma.pedidoCompra.update({
      where: { id: pedidoId },
      data: { necessidadeId: necessidadeId || null },
    });
    return NextResponse.json({ data: record });
  }

  // Vincular / desvincular cotação
  if (body.vincularCotacao !== undefined) {
    const cotacaoId = body.vincularCotacao as string | null;
    const record = await prisma.pedidoCompra.update({
      where: { id: pedidoId },
      data: { cotacaoId: cotacaoId || null },
      include: {
        cotacao: {
          select: {
            id: true, numero: true,
            necessidade: { select: { id: true, numero: true, solicitante: true } },
          },
        },
      },
    });
    return NextResponse.json({ data: record });
  }

  // Default: partial update (dataEntregaPrevista / observacoes / descricao).
  // `status` NÃO é aceito aqui — mudanças de status passam SOMENTE pela rota
  // /status, que valida as TRANSITIONS (aceitar status arbitrário permitia
  // pular o fluxo, ex.: marcar RECEBIDO sem Documento de Entrada).
  const updateData: Record<string, unknown> = {};
  if (body.dataEntregaPrevista !== undefined)
    updateData.dataEntregaPrevista = body.dataEntregaPrevista ? new Date(body.dataEntregaPrevista) : null;
  if (body.observacoes !== undefined) updateData.observacoes = body.observacoes || null;
  if (body.descricao   !== undefined) updateData.descricao   = body.descricao?.trim() || null;

  const record = await prisma.pedidoCompra.update({
    where: { id: pedidoId },
    data: updateData,
  });

  return NextResponse.json({ data: record });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  const pedidoId = params.id;
  const session  = await getSession();
  const isAdmin  = session?.perfil === "ADMIN";

  const pedido = await prisma.pedidoCompra.findUnique({
    where: { id: pedidoId },
    select: {
      status: true,
      conferencia: { select: { id: true, numero: true, status: true } },
    },
  });
  if (!pedido) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (!isAdmin && !["RASCUNHO", "ENVIADO"].includes(pedido.status)) {
    return NextResponse.json({ error: "Apenas pedidos em Rascunho ou Enviado podem ser excluídos" }, { status: 400 });
  }

  // Recebimento concluído tem estoque/custo/razão lançados — não se exclui o
  // pedido por cima: exclua (reverta) primeiro o Documento de Entrada.
  if (pedido.conferencia && ["CONCLUIDA", "DIVERGENCIA"].includes(pedido.conferencia.status)) {
    return NextResponse.json(
      { error: `O pedido tem o Documento de Entrada ${pedido.conferencia.numero} concluído. Exclua/reverta o documento de entrada antes de excluir o pedido.` },
      { status: 409 },
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      // CPs do pedido: 409 se alguma tem baixa; senão apaga títulos + lançamentos.
      await tratarContasPagarDosPedidos(tx, [pedidoId]);
      // DE não concluído (PENDENTE/EM_CONFERENCIA): reverte movimentos (se houver)
      // e apaga o documento + lançamentos, na MESMA transação.
      if (pedido.conferencia) {
        await reverterEExcluirConferencias(tx, [pedido.conferencia.id]);
      }
      await tx.pedidoCompraItem.deleteMany({ where: { pedidoId } });
      await tx.pedidoCompra.delete({ where: { id: pedidoId } });
    });
  } catch (e) {
    if (e instanceof ContaPagarComBaixaError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}
