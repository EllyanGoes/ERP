export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { notifyMovimentacao } from "@/lib/notify-estoque";
import { aplicarCmpmEmpresa } from "@/lib/custo-empresa";
import { gerarContasPagarDoDocumento } from "@/lib/contas-pagar";
import { contabilizarPedidoCompra, contabilizarEntradaEstoque } from "@/lib/contabilidade";
import { recomputarStatusFinanceiroCompra } from "@/lib/pedido-totais";
import { assertItensPermitidosNosLocais, CategoriaLocalInvalidaError, respostaCategoriaInvalida } from "@/lib/estoque-categoria";

const num = (d: unknown) => parseFloat(String(d ?? 0));

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const responsavel = body.responsavel || null;

  // ── Trava de categoria do local (antes da transação, para 422 limpo) ────────
  // O recebimento dá ENTRADA no local de destino de cada item — produto só entra
  // em local que aceite sua categoria. Local sem categorias configuradas aceita
  // tudo (legado).
  {
    const conf = await prisma.conferenciaCompra.findUnique({
      where: { id: params.id },
      select: {
        localEstoqueId: true,
        itens: { select: { itemId: true, localEstoqueId: true, quantidadeRecebida: true } },
      },
    });
    if (conf) {
      const pares = conf.itens
        .filter((it) => num(it.quantidadeRecebida) > 0)
        .map((it) => ({ itemId: it.itemId, localEstoqueId: it.localEstoqueId ?? conf.localEstoqueId ?? null }));
      try {
        await assertItensPermitidosNosLocais(prisma, pares);
      } catch (e) {
        if (e instanceof CategoriaLocalInvalidaError) return respostaCategoriaInvalida(e);
        throw e;
      }
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const conferencia = await tx.conferenciaCompra.findUnique({
      where: { id: params.id },
      include: {
        pedido: { select: { id: true, numero: true, fornecedorId: true, valorTotal: true, condicaoPagamentoId: true, condicoesPagamento: true, intragrupo: true } },
        itens: {
          include: { item: true },
        },
      },
    });

    if (!conferencia) throw new Error("Conferência não encontrada");
    if (conferencia.status === "CONCLUIDA") throw new Error("Conferência já concluída");

    let hasDivergencia = false;
    const movimentacoesCriadas: string[] = [];
    // Preço de compra (custo na unidade base) e qtd recebida por item — usados
    // para atualizar o "último preço" do fornecedor no auto-vínculo abaixo.
    const compraPorItem = new Map<string, { custoBase: number; qtdRecebida: number }>();

    // Data de NEGÓCIO da movimentação = data do documento (dt. emissão); na
    // falta, hoje (dia de São Paulo, à meia-noite UTC). Independe do createdAt.
    const hojeSPdoc = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const dataDoc = conferencia.dtEmissao ?? new Date(`${hojeSPdoc}T00:00:00.000Z`);

    for (const item of conferencia.itens) {
      const qtdRecebida = parseFloat(String(item.quantidadeRecebida ?? 0));
      const qtdPedida = parseFloat(String(item.quantidadePedida));

      if (Math.abs(qtdRecebida - qtdPedida) > 0.001) {
        hasDivergencia = true;
      }

      if (qtdRecebida > 0) {
        // Conversão p/ a unidade BASE do item. A compra pode estar numa unidade
        // alternativa (item.unidadeId): fator = quantos da base cabem em 1 dela
        // (ex.: UN→100 MT ⇒ fator 100). Estoque/custo são SEMPRE na base:
        //   qtdBase = qtdRecebida × fator ; custoBase = vlrUnitario ÷ fator.
        let fator = 1;
        if (item.unidadeId) {
          const iu = await tx.itemUnidade.findFirst({
            where: { itemId: item.itemId, unidadeId: item.unidadeId },
            select: { fatorConversao: true, isPrincipal: true },
          });
          if (iu && !iu.isPrincipal && iu.fatorConversao != null) {
            const f = parseFloat(String(iu.fatorConversao));
            if (Number.isFinite(f) && f > 0) fator = f;
          }
        }
        const qtdBase = qtdRecebida * fator;

        // Use item-specific localEstoqueId if set, otherwise fall back to the
        // conferência's default local, then to null (global stock)
        const targetLocalEstoqueId = item.localEstoqueId ?? conferencia.localEstoqueId ?? null;

        // Get current stock for this location
        const estoqueItem = await tx.estoqueItem.findFirst({
          // empresaId fixa o saldo na empresa DONA da conferência (o modo grupo
          // amplia a leitura e (item, local nulo) ficaria ambíguo entre empresas)
          where: { empresaId: conferencia.empresaId, itemId: item.itemId, localEstoqueId: targetLocalEstoqueId, clienteDonoId: null },
          select: { id: true, quantidadeAtual: true },
        });

        // increment atômico: entradas concorrentes do mesmo item não perdem
        // atualização; os saldos da linha derivam do valor pós-update.
        let saldoDepois: number;
        if (estoqueItem) {
          const atualizado = await tx.estoqueItem.update({
            where: { id: estoqueItem.id },
            data:  { quantidadeAtual: { increment: qtdBase } },
          });
          saldoDepois = parseFloat(String(atualizado.quantidadeAtual));
        } else {
          saldoDepois = qtdBase;
          await tx.estoqueItem.create({
            data: {
              empresaId: conferencia.empresaId,
              clienteDonoId: null,
              itemId: item.itemId,
              quantidadeAtual: qtdBase,
              quantidadeMin: 0,
              localEstoqueId: targetLocalEstoqueId,
            },
          });
        }
        const saldoAntes = saldoDepois - qtdBase;

        // Determine document reference
        const docRef = conferencia.pedido?.numero
          ? `Recebimento ${conferencia.pedido.numero}`
          : `Recebimento ${conferencia.numero}`;

        // Preço por unidade de compra → custo por unidade BASE (÷ fator).
        const vlrUnitario = item.vlrUnitario ? parseFloat(String(item.vlrUnitario)) : null;
        const custoBase = vlrUnitario != null ? vlrUnitario / fator : null;
        if (custoBase != null && custoBase > 0) compraPorItem.set(item.itemId, { custoBase, qtdRecebida });

        // Create stock movement (sempre na unidade base)
        const mov = await tx.movimentacaoEstoque.create({
          data: {
            empresaId: conferencia.empresaId,
            itemId: item.itemId,
            tipo: "ENTRADA",
            quantidade: qtdBase,
            saldoAntes,
            saldoDepois,
            data: dataDoc,
            documento: conferencia.numero,
            observacoes: docRef,
            conferenciaItemId: item.id,
            localEstoqueId: targetLocalEstoqueId,
            valorUnitario: custoBase ?? null,
          },
        });

        movimentacoesCriadas.push(mov.id);
        // (o estoque já foi atualizado/criado atomicamente acima)

        // ── Custo Médio Ponderado Móvel (CMPM) — na unidade BASE ──────────────
        if (custoBase && custoBase > 0) {
          const currentItem = await tx.item.findUnique({
            where: { id: item.itemId },
            select: { precoCusto: true },
          });
          const oldCusto = currentItem?.precoCusto ? parseFloat(String(currentItem.precoCusto)) : 0;

          // Soma todo o estoque atual (já atualizado) e subtrai a qtd base recebida p/ o saldo antes
          const allEstoque = await tx.estoqueItem.findMany({ where: { itemId: item.itemId, clienteDonoId: null } });
          const estoqueTotal = allEstoque.reduce((s, e) => s + parseFloat(String(e.quantidadeAtual)), 0);
          const baseSaldo = Math.max(estoqueTotal - qtdBase, 0);

          const novoCusto = baseSaldo > 0
            ? (baseSaldo * oldCusto + qtdBase * custoBase) / (baseSaldo + qtdBase)
            : custoBase;

          await tx.item.update({
            where: { id: item.itemId },
            data: { precoCusto: novoCusto },
          });

          // CMPM próprio da empresa dona da conferência (custo por empresa).
          await aplicarCmpmEmpresa(tx, conferencia.empresaId, item.itemId, qtdBase, custoBase);
        }

        // Mark divergencia on item
        await tx.conferenciaCompraItem.update({
          where: { id: item.id },
          data: {
            divergencia: Math.abs(qtdRecebida - qtdPedida) > 0.001,
          },
        });
      }
    }

    const finalStatus = hasDivergencia ? "DIVERGENCIA" : "CONCLUIDA";
    // Data da conclusão como data pura (dia de hoje em Brasília, meia-noite UTC) —
    // alinhada ao padrão de exibição (formatDate em UTC) p/ não desviar o dia.
    const hojeSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const hojeUTC = new Date(`${hojeSP}T00:00:00.000Z`);

    // Update conferencia status
    const updatedConferencia = await tx.conferenciaCompra.update({
      where: { id: params.id },
      data: {
        status: finalStatus,
        dataConferencia: hojeUTC,
        ...(responsavel ? { responsavel } : {}),
      },
      include: {
        pedido: {
          include: { fornecedor: { select: { id: true, razaoSocial: true } } },
        },
        fornecedor: { select: { id: true, razaoSocial: true } },
        itens: {
          include: {
            item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } },
            movimentacoes: true,
          },
        },
      },
    });

    // Track which SCs were updated (for user notification)
    const scAtualizadas: Array<{ numero: string; status: string }> = [];

    // Helper: compute and update SC status given a necessidadeId
    async function atualizarStatusSC(necessidadeId: string) {
      const necessidade = await tx.necessidadeCompra.findUnique({
        where: { id: necessidadeId },
        select: {
          numero: true,
          status: true,
          itens: { select: { itemId: true, quantidade: true } },
        },
      });
      if (!necessidade) return;
      // Only update if SC is in a relevant status
      const statusElegiveis = ["EM_COTACAO", "EM_PEDIDO", "APROVADA", "PARCIALMENTE_ATENDIDA", "TOTALMENTE_ATENDIDA"];
      if (!statusElegiveis.includes(necessidade.status)) return;

      const scItems = necessidade.itens;
      if (scItems.length === 0) return;

      // Find ALL pedidos linked to this SC (direct or via cotação)
      // Do NOT filter by PC status — a PC may have been cancelled or updated outside
      // the normal flow; what matters is whether its DE is concluded.
      const pedidosDiretos = await tx.pedidoCompra.findMany({
        where: { necessidadeId },
        select: { id: true },
      });
      const cotacoesDaSc = await tx.cotacaoCompra.findMany({
        where: { necessidadeId },
        select: { id: true },
      });
      const cotacaoIds = cotacoesDaSc.map((c) => c.id);
      const pedidosDeCotacao = cotacaoIds.length > 0
        ? await tx.pedidoCompra.findMany({
            where: { cotacaoId: { in: cotacaoIds } },
            select: { id: true },
          })
        : [];

      const todosPedidoIds = [
        ...pedidosDiretos.map((p) => p.id),
        ...pedidosDeCotacao.map((p) => p.id),
      ];

      // Collect received quantities from concluded conferências
      const confsConcluidas = todosPedidoIds.length > 0
        ? await tx.conferenciaCompra.findMany({
            where: {
              pedidoId: { in: todosPedidoIds },
              status: { in: ["CONCLUIDA", "DIVERGENCIA"] },
            },
            select: {
              itens: { select: { itemId: true, quantidadeRecebida: true } },
            },
          })
        : [];

      const recebidoMap = new Map<string, number>();
      for (const conf of confsConcluidas) {
        for (const ci of conf.itens) {
          const prev = recebidoMap.get(ci.itemId) ?? 0;
          recebidoMap.set(ci.itemId, prev + parseFloat(String(ci.quantidadeRecebida ?? 0)));
        }
      }
      // Also include items being concluded in THIS conferência
      for (const ci of conferencia!.itens) {
        const prev = recebidoMap.get(ci.itemId) ?? 0;
        recebidoMap.set(ci.itemId, prev + parseFloat(String(ci.quantidadeRecebida ?? 0)));
      }

      // Check how many SC items are fully covered
      let totalAtendidos = 0;
      for (const scItem of scItems) {
        const recebido = recebidoMap.get(scItem.itemId) ?? 0;
        const necessario = parseFloat(String(scItem.quantidade));
        if (recebido >= necessario - 0.001) totalAtendidos++;
      }

      // Determine new status
      const algumAtendido = scItems.some((si) => (recebidoMap.get(si.itemId) ?? 0) > 0.001);
      const novoStatus =
        totalAtendidos >= scItems.length
          ? "TOTALMENTE_ATENDIDA"
          : algumAtendido
          ? "PARCIALMENTE_ATENDIDA"
          : null;

      if (novoStatus) {
        await tx.necessidadeCompra.update({
          where: { id: necessidadeId },
          data: { status: novoStatus },
        });
        scAtualizadas.push({ numero: necessidade.numero, status: novoStatus });
      }
    }

    // Update pedido to RECEBIDO (only if linked to a pedido)
    if (conferencia.pedidoId) {
      await tx.pedidoCompra.update({
        where: { id: conferencia.pedidoId },
        data: { status: "RECEBIDO" },
      });

      const pedido = await tx.pedidoCompra.findUnique({
        where: { id: conferencia.pedidoId },
        select: { cotacaoId: true, necessidadeId: true },
      });

      // Collect unique SC IDs to update
      const necessidadeIds = new Set<string>();

      // 1. Direct PC → SC link (new field)
      if (pedido?.necessidadeId) {
        necessidadeIds.add(pedido.necessidadeId);
      }

      // 2. PC → Cotação → SC link (existing path)
      if (pedido?.cotacaoId) {
        const cotacao = await tx.cotacaoCompra.findUnique({
          where: { id: pedido.cotacaoId },
          select: { necessidadeId: true },
        });
        if (cotacao?.necessidadeId) {
          necessidadeIds.add(cotacao.necessidadeId);
        }
      }

      // Update each unique SC
      for (const necessidadeId of Array.from(necessidadeIds)) {
        await atualizarStatusSC(necessidadeId);
      }

      // ── Contas a pagar pela condição de pagamento ──────────────────────────
      // O Documento de Entrada gera o(s) contas a pagar conforme a condição
      // (do DE, senão do pedido, senão casando pelo nome). Valor = total da NF
      // (vrTotal) → total do pedido → Σ recebidos. Intragrupo já espelha à parte.
      const pc = conferencia.pedido;
      if (pc && !pc.intragrupo) {
        const jaTem = await tx.contaPagar.count({ where: { pedidoCompraId: pc.id } });
        if (jaTem === 0) {
          let valorTotal = conferencia.vrTotal != null ? num(conferencia.vrTotal) : 0;
          if (valorTotal <= 0) valorTotal = num(pc.valorTotal);
          if (valorTotal <= 0) {
            valorTotal = conferencia.itens.reduce((s, it) => s + num(it.quantidadeRecebida) * num(it.vlrUnitario), 0);
          }
          if (valorTotal > 0) {
            const condId = conferencia.condicaoPagamentoId ?? pc.condicaoPagamentoId ?? null;
            let condicao = condId ? await tx.condicaoPagamento.findUnique({ where: { id: condId } }) : null;
            if (!condicao && pc.condicoesPagamento) {
              condicao = await tx.condicaoPagamento.findFirst({ where: { nome: pc.condicoesPagamento } });
            }
            await gerarContasPagarDoDocumento(tx, {
              empresaId: conferencia.empresaId,
              fornecedorId: pc.fornecedorId ?? conferencia.fornecedorId,
              pedidoCompraId: pc.id,
              numeroPedido: pc.numero,
              valorTotal,
              dataBase: conferencia.dtEmissao ?? hojeUTC,
              naturezaFinanceiraId: conferencia.naturezaFinanceiraId,
            }, condicao);
            await recomputarStatusFinanceiroCompra(tx, pc.id);
          }
        }
      }
    }

    // ── Auto-vincula o item ao fornecedor e atualiza o ÚLTIMO PREÇO ───────────
    // Toda compra recebida atualiza o preço (custo na unidade base), a data e a
    // quantidade da última compra do fornecedor — alimenta a aba Fornecedores e
    // o "custo médio dos fornecedores" do produto.
    const fornecedorId = conferencia.pedido?.fornecedorId ?? conferencia.fornecedorId;
    const autoVinculos: string[] = [];
    if (fornecedorId) {
      for (const item of conferencia.itens) {
        const qtdRecebida = parseFloat(String(item.quantidadeRecebida ?? 0));
        if (qtdRecebida <= 0) continue;
        const compra = compraPorItem.get(item.itemId);
        const dadosPreco = compra
          ? { precoUltimo: compra.custoBase, qtdeUltimaCompra: compra.qtdRecebida, dataUltimaCompra: dataDoc }
          : {};
        const already = await tx.produtoFornecedor.findFirst({
          where: { itemId: item.itemId, fornecedorId },
          select: { id: true },
        });
        if (already) {
          if (compra) await tx.produtoFornecedor.update({ where: { id: already.id }, data: dadosPreco });
        } else {
          await tx.produtoFornecedor.create({
            data: { itemId: item.itemId, fornecedorId, ...dadosPreco },
          });
          autoVinculos.push(item.item.descricao);
        }
      }
    }

    return { conferencia: updatedConferencia, movimentacoesCriadas, autoVinculos, scAtualizadas };
  });

  // Notify Telegram for each received item (best-effort, outside transaction)
  for (const item of result.conferencia.itens) {
    const qtdRecebida = parseFloat(String(item.quantidadeRecebida ?? 0));
    if (qtdRecebida <= 0) continue;

    const targetLocalEstoqueId = item.localEstoqueId ?? result.conferencia.localEstoqueId ?? undefined;
    prisma.estoqueItem.findFirst({
      where: { empresaId: result.conferencia.empresaId, itemId: item.itemId, clienteDonoId: null, ...(targetLocalEstoqueId ? { localEstoqueId: targetLocalEstoqueId } : {}) },
      include: { localEstoque: { select: { nome: true } } },
    }).then((estoqueAtual) => {
      const saldoDepois = (estoqueAtual ? parseFloat(String(estoqueAtual.quantidadeAtual)) : 0);
      notifyMovimentacao({
        tipo: "ENTRADA",
        itemDescricao: item.item.descricao,
        itemCodigo: item.item.codigo ?? null,
        quantidade: qtdRecebida,
        saldoDepois,
        unidade: item.item.unidadeMedida ?? "un",
        localNome: estoqueAtual?.localEstoque?.nome ?? null,
        documento: result.conferencia.numero,
        observacoes: `Recebimento ${result.conferencia.numero}`,
        quantidadeMin: estoqueAtual?.quantidadeMin != null ? parseFloat(String(estoqueAtual.quantidadeMin)) : null,
      });
    }).catch(() => {});
  }

  // Contabiliza (best-effort, pós-commit): entrada de estoque (D Estoque / C
  // Fornecedor) e a(s) conta(s) a pagar (só o pagamento; a compra de estoque não
  // duplica a despesa). Entrada primeiro (credita o fornecedor).
  await contabilizarEntradaEstoque(params.id).catch(() => {});
  const confPedido = await prisma.conferenciaCompra.findUnique({ where: { id: params.id }, select: { pedido: { select: { id: true } } } });
  if (confPedido?.pedido?.id) await contabilizarPedidoCompra(confPedido.pedido.id).catch(() => {});

  return NextResponse.json({
    data: result.conferencia,
    movimentacoesCriadas: result.movimentacoesCriadas,
    autoVinculos: result.autoVinculos,
    scAtualizadas: result.scAtualizadas,
  });
}
