export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { recontabilizarConferencia, apagarLancamentosContabeis } from "@/lib/contabilidade";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const record = await prisma.conferenciaCompra.findUnique({
    where: { id: params.id },
    include: {
      pedido: {
        include: {
          fornecedor: {
            select: {
              id: true,
              razaoSocial: true,
              nomeFantasia: true,
              cpfCnpj: true,
              contato: true,
              email: true,
            },
          },
        },
      },
      fornecedor: {
        select: {
          id: true,
          razaoSocial: true,
          nomeFantasia: true,
          cpfCnpj: true,
          contato: true,
          email: true,
        },
      },
      localEstoque: { select: { id: true, nome: true } },
      itens: {
        include: {
          item: {
            select: {
              id: true, codigo: true, descricao: true, unidadeMedida: true,
              // Unidades alternativas (p/ escolher a unidade de compra e converter).
              unidade: { select: { id: true, sigla: true } },
              itemUnidades: { select: { unidadeId: true, fatorConversao: true, isPrincipal: true, unidade: { select: { sigla: true } } } },
            },
          },
          localEstoque: { select: { id: true, nome: true } },
          centroCusto: { select: { id: true, codigo: true, nome: true } },
          imobilizado: { select: { id: true, descricao: true } },
          componenteSubstituido: { select: { id: true, descricao: true } },
          movimentacoes: { select: { id: true, tipo: true, quantidade: true, createdAt: true } },
        },
      },
    },
  });

  if (!record) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json({ data: record });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const isAdmin = session.perfil === "ADMIN";

  // Check if DE is in a concluded state — only ADMIN can edit CONCLUIDA;
  // DIVERGENCIA is re-editable by any user (needs correction)
  const current = await prisma.conferenciaCompra.findUnique({
    where: { id: params.id },
    select: { status: true },
  });
  if (!current) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  if (current.status === "CONCLUIDA" && !isAdmin) {
    return NextResponse.json({ error: "Apenas administradores podem editar documentos concluídos" }, { status: 403 });
  }

  const body = await req.json();
  const {
    itens,
    fornecedorId,
    localEstoqueId,
    modoLocalEstoque,
    observacoes,
    tipoNota,
    numeroNF,
    serie,
    dtEmissao,
    ufOrigem,
    espDocumento,
    frete,
    tipoFrete,
    seguro,
    despesas,
    desconto,
    vrTotal,
    condicaoPagamentoId,
    naturezaFinanceiraId,
    status: requestedStatus,
  } = body;

  await prisma.$transaction(async (tx) => {
    if (itens && Array.isArray(itens)) {
      for (const item of itens) {
        const qtdRecebida = parseFloat(String(item.quantidadeRecebida ?? 0));
        const vlrUnit = item.vlrUnitario != null ? parseFloat(String(item.vlrUnitario)) : undefined;
        const vlrTot = item.vlrTotal != null ? parseFloat(String(item.vlrTotal)) : undefined;
        const vlrIPI = item.vlrIPI != null ? parseFloat(String(item.vlrIPI)) : undefined;
        const vlrICMS = item.vlrICMS != null ? parseFloat(String(item.vlrICMS)) : undefined;
        const itemDesconto = item.desconto != null ? parseFloat(String(item.desconto)) : undefined;

        if (!item.id) {
          // NEW item — create it
          if (!item.itemId) continue;
          const qtdPedida = parseFloat(String(item.quantidadePedida ?? qtdRecebida));
          const divergencia = Math.abs(qtdRecebida - qtdPedida) > 0.001;
          await tx.conferenciaCompraItem.create({
            data: {
              conferenciaId: params.id,
              itemId: item.itemId,
              unidadeId: item.unidadeId || null,
              quantidadePedida: qtdPedida,
              quantidadeRecebida: qtdRecebida,
              divergencia,
              observacao: item.observacao || null,
              vlrUnitario: vlrUnit ?? null,
              vlrTotal: vlrTot ?? null,
              vlrIPI: vlrIPI ?? null,
              vlrICMS: vlrICMS ?? null,
              tipoEntrada: item.tipoEntrada || null,
              codFiscal: item.codFiscal || null,
              tpOper: item.tpOper || null,
              localEstoqueId: item.localEstoqueId || null,
              // Centro herdado do pedido / escolhido na entrada (default editável).
              centroCustoId: item.centroCustoId || null,
              // Capex (herança/orçamento na entrada): bem só quando capitaliza.
              capitaliza: item.capitaliza ?? null,
              imobilizadoId: item.capitaliza ? (item.imobilizadoId || null) : null,
              componenteSubstituidoId: item.capitaliza ? (item.componenteSubstituidoId || null) : null,
              desconto: itemDesconto ?? null,
            },
          });
          continue;
        }

        // EXISTING item — update it
        const ci = await tx.conferenciaCompraItem.findUnique({
          where: { id: item.id },
          select: { quantidadePedida: true },
        });
        const divergencia = ci
          ? Math.abs(qtdRecebida - parseFloat(String(ci.quantidadePedida))) > 0.001
          : false;

        await tx.conferenciaCompraItem.update({
          where: { id: item.id },
          data: {
            quantidadeRecebida: qtdRecebida,
            divergencia,
            ...(item.unidadeId !== undefined ? { unidadeId: item.unidadeId || null } : {}),
            ...(item.observacao !== undefined ? { observacao: item.observacao || null } : {}),
            ...(vlrUnit !== undefined ? { vlrUnitario: vlrUnit } : {}),
            ...(vlrTot !== undefined ? { vlrTotal: vlrTot } : {}),
            ...(vlrIPI !== undefined ? { vlrIPI: vlrIPI } : {}),
            ...(vlrICMS !== undefined ? { vlrICMS: vlrICMS } : {}),
            ...(item.tipoEntrada !== undefined ? { tipoEntrada: item.tipoEntrada || null } : {}),
            ...(item.codFiscal !== undefined ? { codFiscal: item.codFiscal || null } : {}),
            ...(item.tpOper !== undefined ? { tpOper: item.tpOper || null } : {}),
            ...(item.localEstoqueId !== undefined ? { localEstoqueId: item.localEstoqueId || null } : {}),
            ...(item.centroCustoId !== undefined ? { centroCustoId: item.centroCustoId || null } : {}),
            ...(item.capitaliza !== undefined ? {
              capitaliza: item.capitaliza ?? null,
              imobilizadoId: item.capitaliza ? (item.imobilizadoId || null) : null,
              componenteSubstituidoId: item.capitaliza ? (item.componenteSubstituidoId || null) : null,
            } : {}),
            ...(itemDesconto !== undefined ? { desconto: itemDesconto || null } : {}),
          },
        });
      }
    }

    // Determine new status:
    // - Admin can explicitly set any status via requestedStatus
    // - PENDENTE auto-transitions to EM_CONFERENCIA on save
    // - Concluded DEs keep their status unless admin changes it
    let newStatus: string;
    if (isAdmin && requestedStatus) {
      newStatus = requestedStatus;
    } else if (current.status === "PENDENTE") {
      newStatus = "EM_CONFERENCIA";
    } else {
      newStatus = current.status;
    }
    const updateData: Record<string, unknown> = { status: newStatus };
    if (fornecedorId !== undefined) updateData.fornecedorId = fornecedorId || null;
    if (localEstoqueId !== undefined) updateData.localEstoqueId = localEstoqueId || null;
    if (modoLocalEstoque !== undefined) updateData.modoLocalEstoque = modoLocalEstoque || "POR_ITEM";
    if (observacoes !== undefined) updateData.observacoes = observacoes || null;
    if (tipoNota !== undefined) updateData.tipoNota = tipoNota || null;
    if (numeroNF !== undefined) updateData.numeroNF = numeroNF || null;
    if (serie !== undefined) updateData.serie = serie || null;
    if (dtEmissao !== undefined) updateData.dtEmissao = dtEmissao ? new Date(dtEmissao) : null;
    if (ufOrigem !== undefined) updateData.ufOrigem = ufOrigem || null;
    if (espDocumento !== undefined) updateData.espDocumento = espDocumento || null;
    if (frete !== undefined) updateData.frete = frete != null ? parseFloat(String(frete)) : null;
    if (tipoFrete !== undefined) updateData.tipoFrete = tipoFrete || null;
    if (seguro !== undefined) updateData.seguro = seguro != null ? parseFloat(String(seguro)) : null;
    if (despesas !== undefined) updateData.despesas = despesas != null ? parseFloat(String(despesas)) : null;
    if (desconto !== undefined) updateData.desconto = desconto != null ? parseFloat(String(desconto)) : null;
    if (vrTotal !== undefined) updateData.vrTotal = vrTotal != null ? parseFloat(String(vrTotal)) : null;
    if (condicaoPagamentoId !== undefined) updateData.condicaoPagamentoId = condicaoPagamentoId || null;
    if (naturezaFinanceiraId !== undefined) updateData.naturezaFinanceiraId = naturezaFinanceiraId || null;

    await tx.conferenciaCompra.update({
      where: { id: params.id },
      data: updateData,
    });
  });

  const updated = await prisma.conferenciaCompra.findUnique({
    where: { id: params.id },
    include: {
      pedido: {
        include: {
          fornecedor: {
            select: {
              id: true,
              razaoSocial: true,
              nomeFantasia: true,
              cpfCnpj: true,
              contato: true,
              email: true,
            },
          },
        },
      },
      fornecedor: {
        select: {
          id: true,
          razaoSocial: true,
          nomeFantasia: true,
          cpfCnpj: true,
          contato: true,
          email: true,
        },
      },
      localEstoque: { select: { id: true, nome: true } },
      itens: {
        include: {
          item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } },
          localEstoque: { select: { id: true, nome: true } },
          centroCusto: { select: { id: true, codigo: true, nome: true } },
          imobilizado: { select: { id: true, descricao: true } },
          componenteSubstituido: { select: { id: true, descricao: true } },
          movimentacoes: true,
        },
      },
    },
  });

  // DE concluída e depois editada → re-sincroniza a contabilidade da entrada de
  // estoque (apaga e refaz). Best-effort, pós-commit.
  if (current.status === "CONCLUIDA") {
    await recontabilizarConferencia(params.id).catch(() => {});
  }

  return NextResponse.json({ data: updated });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const current = await prisma.conferenciaCompra.findUnique({
    where: { id: params.id },
    select: { status: true, empresaId: true, itens: { select: { id: true } } },
  });
  if (!current) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  // Docs concluídos/divergentes só podem ser excluídos por ADMIN
  const isConcluded = current.status === "CONCLUIDA" || current.status === "DIVERGENCIA";
  if (isConcluded && session.perfil !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores podem excluir documentos concluídos" }, { status: 403 });
  }

  // Excluir uma conferência tem de DESFAZER tudo que a conclusão fez — senão o
  // estoque e a contabilidade ficam inflados e o movimento de ENTRADA vira órfão
  // (a FK conferenciaItemId é ON DELETE SET NULL, não apaga o movimento).
  await prisma.$transaction(async (tx) => {
    const itemIds = current.itens.map((i) => i.id);
    const movs = itemIds.length
      ? await tx.movimentacaoEstoque.findMany({
          where: { conferenciaItemId: { in: itemIds }, tipo: "ENTRADA" },
          select: { id: true, itemId: true, localEstoqueId: true, quantidade: true, clienteDonoId: true },
        })
      : [];
    // 1) Estoque: reverter o incremento feito na conclusão (por item/local).
    for (const m of movs) {
      const ei = await tx.estoqueItem.findFirst({
        where: { empresaId: current.empresaId, itemId: m.itemId, localEstoqueId: m.localEstoqueId, clienteDonoId: m.clienteDonoId },
        select: { id: true },
      });
      if (ei) {
        await tx.estoqueItem.update({ where: { id: ei.id }, data: { quantidadeAtual: { decrement: m.quantidade } } });
      }
    }
    // 2) Movimentações: apagar as ENTRADAs geradas (não deixar órfãs).
    if (movs.length) {
      await tx.movimentacaoEstoque.deleteMany({ where: { id: { in: movs.map((m) => m.id) } } });
    }
    // 3) Conferência (cascade nos itens).
    await tx.conferenciaCompra.delete({ where: { id: params.id } });

    // 4) Contabilidade: apagar o lançamento da entrada (D Estoque / C Fornecedor)
    // DENTRO da transação — se falhar, tudo faz rollback e não sobra órfão no razão.
    // (CMPM do item não é revertido — média móvel; ajuste manual se necessário.)
    await apagarLancamentosContabeis({ empresaId: current.empresaId, origemTipo: "ESTOQUE_ENTRADA", origemId: params.id }, tx);
  });

  return NextResponse.json({ ok: true });
}
