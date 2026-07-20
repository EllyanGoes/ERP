export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireModulo, requireModuloAny } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { salvarNaLixeira } from "@/lib/lixeira";
import { getSession } from "@/lib/auth";
import { recontabilizarConferencia, apagarLancamentosContabeis } from "@/lib/contabilidade";
import { recomputarStatusFinanceiroCompra } from "@/lib/pedido-totais";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModuloAny(["compras", "financeiro"]);
  if (!auth.ok) return auth.response;

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
          // Cobre o pagamento antecipado (PA): o título nasce no pedido, com
          // pedidoCompraId mas sem conferenciaId — não apareceria em contasPagar abaixo.
          contasPagar: {
            select: {
              id: true, numero: true, descricao: true, valorOriginal: true, valorPago: true,
              dataVencimento: true, dataPagamento: true, dataCompetencia: true, status: true,
              parcelaNumero: true, parcelaTotal: true, notaFiscal: true, criadoPor: true, atualizadoPor: true,
            },
            orderBy: [{ dataVencimento: "asc" }, { numero: "asc" }],
          },
          // Subtotal do pedido p/ o rateio de encargos na prévia das duplicatas.
          itens: { select: { valorTotal: true } },
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
      // Títulos gerados por este documento de entrada (parcelas do contas a pagar).
      contasPagar: {
        select: {
          id: true, numero: true, descricao: true, valorOriginal: true, valorPago: true,
          dataVencimento: true, dataPagamento: true, dataCompetencia: true, status: true,
          parcelaNumero: true, parcelaTotal: true, notaFiscal: true, criadoPor: true, atualizadoPor: true,
        },
        orderBy: [{ dataVencimento: "asc" }, { numero: "asc" }],
      },
      formaPagamento: { select: { id: true, nome: true, tipo: true } },
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
    formaPagamentoId,
    naturezaFinanceiraId,
    valorPagoAntecipado,
    dataPagoAntecipado,
    formaPagoAntecipadoId,
    contaPagoAntecipadoId,
    parcelasCustom,
  } = body;

  await prisma.$transaction(async (tx) => {
    if (itens && Array.isArray(itens)) {
      // Pais antes dos filhos: um item novo pode ser COMPONENTE (paiId de item
      // existente, ou paiIndex apontando para o pai no próprio array quando os
      // dois são novos). idsPorIndex resolve paiIndex → id recém-criado.
      const idsPorIndex: (string | null)[] = itens.map((it: { id?: string }) => it.id ?? null);
      const ehFilho = (it: { paiId?: string | null; paiIndex?: number | null }) =>
        !!it.paiId || (it.paiIndex != null && it.paiIndex >= 0);
      const ordem = itens.map((_: unknown, i: number) => i)
        .sort((a: number, b: number) => (ehFilho(itens[a]) ? 1 : 0) - (ehFilho(itens[b]) ? 1 : 0));
      for (const idx of ordem) {
        const item = itens[idx];
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
          const criado = await tx.conferenciaCompraItem.create({
            data: {
              conferenciaId: params.id,
              itemId: item.itemId,
              paiId: item.paiId || (item.paiIndex != null ? idsPorIndex[item.paiIndex] : null),
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
              tesId: item.tesId || null,
              compoeCusto: item.compoeCusto ?? null,
              desconto: itemDesconto ?? null,
            },
          });
          idsPorIndex[idx] = criado.id;
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
            ...(item.tesId !== undefined ? { tesId: item.tesId || null } : {}),
            ...(item.compoeCusto !== undefined ? { compoeCusto: item.compoeCusto ?? null } : {}),
            ...(itemDesconto !== undefined ? { desconto: itemDesconto || null } : {}),
          },
        });
      }
    }

    // Determine new status:
    // - PENDENTE auto-transitions to EM_CONFERENCIA on save
    // - Concluded DEs keep their status
    // `status` NÃO é aceito no PATCH (nem para ADMIN): concluir passa SOMENTE
    // pela rota /concluir (que lança estoque/CMPM/contábil) e reverter é o
    // DELETE — marcar CONCLUIDA por aqui criava documento "concluído" sem
    // nenhum lançamento (ou "revertia" sem desfazer nada).
    const newStatus: string = current.status === "PENDENTE" ? "EM_CONFERENCIA" : current.status;
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
    if (formaPagamentoId !== undefined) updateData.formaPagamentoId = formaPagamentoId || null;
    if (naturezaFinanceiraId !== undefined) updateData.naturezaFinanceiraId = naturezaFinanceiraId || null;
    if (valorPagoAntecipado !== undefined) updateData.valorPagoAntecipado = valorPagoAntecipado != null ? parseFloat(String(valorPagoAntecipado)) : null;
    if (dataPagoAntecipado !== undefined) updateData.dataPagoAntecipado = dataPagoAntecipado ? new Date(dataPagoAntecipado) : null;
    if (formaPagoAntecipadoId !== undefined) updateData.formaPagoAntecipadoId = formaPagoAntecipadoId || null;
    if (contaPagoAntecipadoId !== undefined) updateData.contaPagoAntecipadoId = contaPagoAntecipadoId || null;
    // Grade manual de duplicatas: array não-vazio persiste; vazio/null limpa
    // (volta à grade automática da condição).
    if (parcelasCustom !== undefined) {
      updateData.parcelasCustom = Array.isArray(parcelasCustom) && parcelasCustom.length > 0
        ? parcelasCustom
        : Prisma.DbNull;
    }

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
    select: {
      status: true,
      empresaId: true,
      pedidoId: true,
      pedido: { select: { id: true, status: true } },
      itens: { select: { id: true } },
    },
  });
  if (!current) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  // Docs concluídos/divergentes só podem ser excluídos por ADMIN
  const isConcluded = current.status === "CONCLUIDA" || current.status === "DIVERGENCIA";
  if (isConcluded && session.perfil !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores podem excluir documentos concluídos" }, { status: 403 });
  }

  // Contas a Pagar geradas por esta entrada (as do pedido, exceto as ANTECIPADAS
  // — o PA nasce no pedido, não na entrada): com baixa → 409; ABERTAS → excluir.
  if (current.pedidoId) {
    const cpsComBaixa = await prisma.contaPagar.findMany({
      where: {
        pedidoCompraId: current.pedidoId,
        antecipado: false,
        OR: [{ status: { in: ["PAGA", "PARCIAL"] } }, { valorPago: { gt: 0 } }],
      },
      select: { numero: true },
    });
    if (cpsComBaixa.length > 0) {
      return NextResponse.json(
        { error: `Não é possível excluir: ${cpsComBaixa.length === 1 ? "o título" : "os títulos"} ${cpsComBaixa.map((c) => c.numero).join(", ")} já ${cpsComBaixa.length === 1 ? "tem" : "têm"} pagamento registrado. Estorne a baixa no financeiro antes.` },
        { status: 409 },
      );
    }
  }

  // Excluir uma conferência tem de DESFAZER tudo que a conclusão fez — senão o
  // estoque e a contabilidade ficam inflados e o movimento de ENTRADA vira órfão
  // (a FK conferenciaItemId é ON DELETE SET NULL, não apaga o movimento).
  await prisma.$transaction(async (tx) => {
    // Snapshot na LIXEIRA antes de apagar (consulta/reconstrução em /admin/lixeira).
    const cheia = await tx.conferenciaCompra.findUnique({
      where: { id: params.id },
      include: {
        itens: { include: { item: { select: { codigo: true, descricao: true } } } },
        pedido: { select: { numero: true } },
        fornecedor: { select: { razaoSocial: true } },
      },
    });
    if (cheia) {
      await salvarNaLixeira(tx, {
        empresaId: cheia.empresaId,
        tipo: "CONFERENCIA_COMPRA",
        origemId: cheia.id,
        numero: cheia.numero,
        descricao: `${cheia.status}${cheia.pedido?.numero ? ` · Pedido ${cheia.pedido.numero}` : " · avulsa"}${cheia.fornecedor?.razaoSocial ? ` · ${cheia.fornecedor.razaoSocial}` : ""} · ${cheia.itens.length} item(ns)`,
        snapshot: cheia,
        apagadoPor: session.nome,
      });
    }

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

    // 5) Pedido vinculado: exclui as CPs da entrada (ABERTAS, não antecipadas) e
    // seus lançamentos, volta o status RECEBIDO→EM_TRANSITO (a entrada deixou de
    // existir) e recomputa o statusFinanceiro.
    if (current.pedidoId) {
      const cps = await tx.contaPagar.findMany({
        where: { pedidoCompraId: current.pedidoId, antecipado: false },
        select: { id: true },
      });
      if (cps.length > 0) {
        const cpIds = cps.map((c) => c.id);
        await apagarLancamentosContabeis({ origemTipo: { in: ["COMPRA", "PAGAMENTO"] }, origemId: { in: cpIds } }, tx);
        await tx.contaPagar.deleteMany({ where: { id: { in: cpIds } } });
      }
      if (current.pedido?.status === "RECEBIDO") {
        await tx.pedidoCompra.update({ where: { id: current.pedidoId }, data: { status: "EM_TRANSITO" } });
      }
      await recomputarStatusFinanceiroCompra(tx, current.pedidoId);
    }
  });

  return NextResponse.json({ ok: true });
}
