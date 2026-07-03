export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { salvarNaLixeira } from "@/lib/lixeira";
import { recalcularSaldos } from "@/lib/estoque-saldos";
import { requireModulo } from "@/lib/permissions";
import { getSession } from "@/lib/auth";
import { pedidoVendaSchema } from "@/lib/validations/pedido-venda";
import { recalcPedidoValorTotal, recomputarStatusPedido } from "@/lib/pedido-totais";
import { mudarStatusPedidoVenda, STATUS_PEDIDO_VENDA, type StatusPedidoVenda } from "@/lib/pedido-venda-status";
import { contaCaixaIdDaEmpresa } from "@/lib/empresa";
import { formaEletronicaNoCaixa } from "@/lib/roteamento-conta";
import { recontabilizarClientePedido, apagarLancamentosContabeis } from "@/lib/contabilidade";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  const pedido = await prisma.pedidoVenda.findUnique({
    where: { id: params.id },
    include: {
      cliente: true,
      // Venda à ordem (triangular): empresa que entrega/baixa e o link entre a
      // venda comercial e o pedido de entrega gerado.
      estoqueOrigemEmpresa: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      pedidoVendaOrigem: { select: { id: true, numero: true, empresa: { select: { razaoSocial: true, nomeFantasia: true } } } },
      entregasTriangular: { select: { id: true, numero: true, status: true, empresa: { select: { razaoSocial: true, nomeFantasia: true } } } },
      pagamentos: { orderBy: { ordem: "asc" } },
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
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = pedidoVendaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { itens, pagamentos, pagamentoData, ...pedidoData } = parsed.data;

  // Totais SERVER-SIDE: o valorTotal de cada linha é recomputado de
  // qtd × preço − desconto (R$) — o total enviado pelo client é ignorado
  // (um client adulterado não pode vender abaixo do preço das linhas).
  const round2srv = (n: number) => Math.round(n * 100) / 100;
  const totalLinha = (i: { quantidade: number; precoUnitario: number; valorDesconto?: number | null }) =>
    Math.max(0, round2srv(i.quantidade * i.precoUnitario - (i.valorDesconto ?? 0)));
  const valorProdutos = round2srv(itens.reduce((sum, i) => sum + totalLinha(i), 0));
  const valorTotal = round2srv(valorProdutos - (pedidoData.valorDesconto ?? 0) + (pedidoData.valorFrete ?? 0));

  // Comodato (saída) editado como rascunho: linhas com `id` já existem (update),
  // sem `id` são novas (create), e as que sumiram são removidas. Lido do corpo
  // bruto porque o schema do pedido descarta chaves desconhecidas.
  const comodatoRaw: Array<Record<string, unknown>> = Array.isArray(body.comodato) ? body.comodato : [];
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

  // Venda à ordem na edição: um pedido pode passar a ser (ou deixar de ser) à
  // ordem enquanto não houver entrega. Lido do corpo bruto (o schema descarta).
  const pedidoAtual = await prisma.pedidoVenda.findUnique({
    where: { id: params.id },
    select: { empresaId: true, estoqueOrigemEmpresaId: true, clienteId: true },
  });
  if (!pedidoAtual) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  // Regra: o cliente do título segue o cliente do pedido. Se o cliente do
  // pedido mudar, propaga para as contas a receber vinculadas e realinha o
  // contábil (Clientes a Receber / Material a Entregar / recebimentos).
  const clienteMudou = pedidoData.clienteId != null && pedidoData.clienteId !== pedidoAtual.clienteId;

  const novaOrigem: string | null =
    typeof body.estoqueOrigemEmpresaId === "string" && body.estoqueOrigemEmpresaId ? body.estoqueOrigemEmpresaId : null;
  const novoPrecoTransf: number | null =
    novaOrigem && body.precoTransferencia != null && Number(body.precoTransferencia) > 0 ? Number(body.precoTransferencia) : null;

  if (novaOrigem !== (pedidoAtual.estoqueOrigemEmpresaId ?? null)) {
    // Alterar a origem do estoque só é permitido antes de qualquer entrega.
    const temMinuta = Array.from(minutadoByItem.values()).some((v) => v > 0);
    if (temMinuta) {
      return NextResponse.json({ error: "Não é possível alterar a venda à ordem após iniciar a entrega (já há minutas)." }, { status: 422 });
    }
    if (novaOrigem) {
      if (novaOrigem === pedidoAtual.empresaId) {
        return NextResponse.json({ error: "A empresa de origem do estoque deve ser diferente da empresa da venda" }, { status: 400 });
      }
      const session = await getSession();
      if (!(session?.empresaIds ?? []).includes(novaOrigem)) {
        return NextResponse.json({ error: "Empresa de origem não permitida para este usuário" }, { status: 403 });
      }
    }
  }

  const mapLine = (item: (typeof itens)[number]) => ({
    itemId: item.itemId,
    quantidade: item.quantidade,
    precoUnitario: item.precoUnitario,
    precoTransferencia: novaOrigem && item.precoTransferencia != null && Number(item.precoTransferencia) > 0
      ? Number(item.precoTransferencia) : null,
    // Grava os TRÊS campos de desconto do item (igual ao POST) — antes só
    // `desconto` era salvo, e o detalhe/edição leem `valorDesconto`/`descontoPct`,
    // fazendo o desconto "sumir" ao reabrir.
    descontoPct:   item.descontoPct   ?? 0,
    valorDesconto: item.valorDesconto ?? 0,
    desconto:      item.desconto      ?? 0,
    // Recomputado no server (qtd × preço − desconto) — nunca o total do client.
    valorTotal: totalLinha(item),
  });

  try {
    const pedido = await prisma.$transaction(async (tx) => {
      await tx.pedidoVenda.update({
        where: { id: params.id },
        data: {
          ...pedidoData,
          // Re-deriva modalidade quando a necessidade de entrega é alterada.
          ...(pedidoData.necessidadeEntrega
            ? { modalidade: pedidoData.necessidadeEntrega === "RETIRADA" ? "BALCAO" : "AGENDADA" }
            : {}),
          valorProdutos,
          valorTotal,
          estoqueOrigemEmpresaId: novaOrigem,
          precoTransferencia: novoPrecoTransf,
          dataEmissao: pedidoData.dataEmissao ? new Date(pedidoData.dataEmissao) : new Date(),
          dataEntrega: pedidoData.dataEntrega ? new Date(pedidoData.dataEntrega) : null,
        },
      });

      // Título segue o pedido: propaga o novo cliente para as CRs vinculadas.
      if (clienteMudou) {
        await tx.contaReceber.updateMany({
          where: { pedidoVendaId: params.id },
          data: { clienteId: pedidoData.clienteId },
        });
      }

      // Pagamentos previstos: substitui (delete + create), como os itens.
      // MAS só enquanto o pedido NÃO foi recebido — depois do recebimento, os
      // pagamentos guardam a CONTA de destino real (gravada pelo balcão/receber)
      // e a edição do admin não pode apagá-la. Se já há conta a receber, mantém.
      const jaRecebido = await tx.contaReceber.count({ where: { pedidoVendaId: params.id } });
      if (Array.isArray(pagamentos) && jaRecebido === 0) {
        await tx.pedidoVendaPagamento.deleteMany({ where: { pedidoVendaId: params.id } });
        if (pagamentos.length > 0) {
          await tx.pedidoVendaPagamento.createMany({
            data: pagamentos.map((p, i) => ({ pedidoVendaId: params.id, forma: p.forma, valor: p.valor, ordem: i })),
          });
        }
      } else if (Array.isArray(pagamentos) && jaRecebido > 0) {
        // Há conta(s) a receber vinculada(s). Três casos:
        //  • título único EM ABERTO (a prazo, nada recebido) → só ajusta o valor
        //    do título e os pagamentos previstos ao novo total (sem caixa);
        //  • título único PAGO (balcão/receber, não parcelado) → re-sincroniza o
        //    financeiro (reconstrói os lançamentos) com os valores/formas/contas;
        //  • parcelado / parcial / múltiplos / com baixa → bloqueia (estorne antes).
        const crs = await tx.contaReceber.findMany({ where: { pedidoVendaId: params.id } });
        const totalRecebido = crs.reduce((s, c) => s + Number(c.valorPago), 0);
        const unicoCr = crs.length === 1 ? crs[0] : null;

        if (unicoCr && unicoCr.status === "ABERTA" && !unicoCr.grupoParcelamentoId && totalRecebido === 0) {
          // Título a receber EM ABERTO: nada foi recebido — reajusta o valor do
          // título e os pagamentos previstos ao novo total, sem lançar no caixa.
          await tx.pedidoVendaPagamento.deleteMany({ where: { pedidoVendaId: params.id } });
          if (pagamentos.length > 0) {
            await tx.pedidoVendaPagamento.createMany({
              data: pagamentos.map((p, i) => ({ pedidoVendaId: params.id, forma: p.forma, valor: p.valor, ordem: i })),
            });
          }
          await tx.contaReceber.update({ where: { id: unicoCr.id }, data: { valorOriginal: valorTotal } });
        } else if (unicoCr && unicoCr.status === "PAGA" && !unicoCr.grupoParcelamentoId) {
          // Recebimento PADRÃO (balcão/receber): re-sincroniza o financeiro
          // (decisão do dono: reajustar tudo — o "valor recebido" e o total acompanham).
          const cr = unicoCr;

          // Substitui os pagamentos previstos com os valores/formas/contas editados.
          await tx.pedidoVendaPagamento.deleteMany({ where: { pedidoVendaId: params.id } });
          if (pagamentos.length > 0) {
            await tx.pedidoVendaPagamento.createMany({
              data: pagamentos.map((p, i) => ({ pedidoVendaId: params.id, forma: p.forma, valor: p.valor, ordem: i, contaBancariaId: p.contaBancariaId ?? null })),
            });
          }

          // Reconstrói os lançamentos da CR a partir das linhas editadas (uma por
          // forma, na sua conta) e reajusta a conta a receber ao novo total.
          const round2 = (n: number) => Math.round(n * 100) / 100;
          const caixaPadrao = contaCaixaIdDaEmpresa(cr.empresaId);
          const linhasPag = pagamentos
            .filter((p) => Number(p.valor) > 0)
            .map((p) => ({ forma: p.forma, contaBancariaId: p.contaBancariaId || caixaPadrao, valor: round2(Number(p.valor)) }));

          const ruim = await formaEletronicaNoCaixa(tx, cr.empresaId, linhasPag.map((l) => ({ forma: l.forma, contaBancariaId: l.contaBancariaId })));
          if (ruim) throw new Error(`ROTEAMENTO::A forma "${ruim.forma}" não pode ser recebida no Caixa em Dinheiro — selecione a conta bancária de destino.`);

          const novaData = pagamentoData ? new Date(`${pagamentoData}T00:00:00.000Z`) : (cr.dataPagamento ?? new Date());
          await tx.lancamentoFinanceiro.deleteMany({ where: { contaReceberId: cr.id } });
          for (const l of linhasPag) {
            await tx.lancamentoFinanceiro.create({
              data: {
                empresaId: cr.empresaId, tipo: "RECEITA",
                descricao: `Recebimento ${cr.numero}${linhasPag.length > 1 ? ` (${l.forma})` : ""}`,
                valor: l.valor, dataLancamento: novaData,
                contaReceberId: cr.id, contaBancariaId: l.contaBancariaId,
                naturezaFinanceiraId: cr.naturezaFinanceiraId ?? undefined,
              },
            });
          }
          const somaPag = round2(linhasPag.reduce((s, l) => s + l.valor, 0));
          await tx.contaReceber.update({
            where: { id: cr.id },
            data: {
              valorOriginal: valorTotal,
              valorPago: somaPag,
              status: somaPag >= valorTotal - 0.001 ? "PAGA" : somaPag > 0 ? "PARCIAL" : "ABERTA",
              dataPagamento: somaPag > 0 ? novaData : null,
              formaPagamento: Array.from(new Set(linhasPag.map((l) => l.forma))).join(" + ") || null,
            },
          });
        } else {
          throw new Error("PEDIDO_RECEBIDO_COMPLEXO");
        }
      }

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

      // Itens/contas podem ter mudado → recomputa os status do pedido.
      await recomputarStatusPedido(tx, params.id);

      return tx.pedidoVenda.findUnique({
        where: { id: params.id },
        include: { cliente: true, itens: { include: { item: true } } },
      });
    });

    // Toda edição do pedido (valor, itens, cliente…) realinha a contabilidade ao
    // estado atual — apaga e refaz venda/título/entrega (best-effort, pós-commit).
    // Antes só rodava quando o cliente mudava, deixando o contábil defasado quando
    // o valor era editado depois de já contabilizado.
    await recontabilizarClientePedido(params.id).catch(() => {});

    return NextResponse.json({ data: pedido });
  } catch (err) {
    if (err instanceof Error && err.message === "CONFLICT_MINUTA") {
      return NextResponse.json(
        { error: "Não é possível alterar este pedido: há itens com minutas que seriam removidos. Cancele as minutas primeiro." },
        { status: 409 },
      );
    }
    if (err instanceof Error && err.message === "PEDIDO_RECEBIDO_COMPLEXO") {
      return NextResponse.json(
        { error: "Este pedido tem recebimento parcelado ou baixa manual — estorne o recebimento antes de alterar os valores." },
        { status: 422 },
      );
    }
    if (err instanceof Error && err.message.startsWith("ROTEAMENTO::")) {
      return NextResponse.json({ error: err.message.slice("ROTEAMENTO::".length) }, { status: 422 });
    }
    return NextResponse.json(
      { error: "Erro ao salvar pedido. Verifique se há minutas vinculadas aos itens." },
      { status: 400 },
    );
  }
}

// Mudança de status — mesma máquina do PATCH /api/pedidos-venda/[id]/status
// (src/lib/pedido-venda-status.ts): transições validadas (override só ADMIN),
// cancelamento reverte estoque/caixa/contábil/espelhos nos dois caminhos e o
// faturamento (CR) nasce na ENTREGA, não aqui.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const { status, override, dataConclusao } = body as { status?: string; override?: boolean; dataConclusao?: string | null };
  if (!status) return NextResponse.json({ error: "status é obrigatório" }, { status: 400 });
  if (!STATUS_PEDIDO_VENDA.includes(status as StatusPedidoVenda)) {
    return NextResponse.json({ error: "Status inválido" }, { status: 400 });
  }

  const r = await mudarStatusPedidoVenda({
    pedidoVendaId: params.id,
    novoStatus: status as StatusPedidoVenda,
    perfil: auth.session.perfil,
    override: override === true,
    dataConclusao: typeof dataConclusao === "string" ? dataConclusao : null,
  });
  if (!r.ok) {
    return NextResponse.json(
      { error: r.error, ...(r.pendentes ? { pendentes: r.pendentes } : {}) },
      { status: r.status },
    );
  }
  return NextResponse.json({ data: r.data });
}

// Exclusão DEFINITIVA do pedido — restrita ao perfil ADMIN. Diferente de
// cancelar (que só muda o status para CANCELADO), aqui o lançamento é removido
// do banco. Bloqueia quando há minutas (entregas) ou contas a receber
// vinculadas, para não corromper logística/financeiro. Os itens do pedido
// saem em cascata (onDelete: Cascade); movimentações ficam com o vínculo nulo.
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;
  if (auth.session.perfil !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores podem excluir pedidos de venda." }, { status: 403 });
  }

  const pedido = await prisma.pedidoVenda.findUnique({
    where: { id: params.id },
    select: { id: true, numero: true, empresaId: true, estoqueOrigemEmpresaId: true },
  });
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  // Exclusão EM CADEIA ("em rede"): remove o pedido e tudo que ele gerou, mesmo
  // através das empresas do grupo — por isso usa prismaSemEscopo. Estorna o
  // estoque (devolve o saldo dos movimentos), apaga as contas a receber/pagar
  // (inclusive o financeiro intragrupo da venda à ordem) e, quando é venda à
  // ordem, também o Pedido de Entrega criado na empresa de origem. A confirmação
  // e o aviso ao usuário ficam na tela (este endpoint só é chamado após o "ok").
  try {
    const resumo = await prismaSemEscopo.$transaction(async (tx) => {
      // 0) Snapshot na LIXEIRA (documento + o que a cadeia vai apagar) — permite
      // consulta/reconstrução em /admin/lixeira.
      const cheio = await tx.pedidoVenda.findUnique({
        where: { id: pedido.id },
        include: {
          itens: { include: { item: { select: { codigo: true, descricao: true } } } },
          minutas: { include: { itens: true } },
          contasReceber: true,
          pagamentos: true,
          cliente: { select: { razaoSocial: true } },
        },
      });
      if (cheio) {
        await salvarNaLixeira(tx, {
          empresaId: pedido.empresaId,
          tipo: "PEDIDO_VENDA",
          origemId: pedido.id,
          numero: pedido.numero,
          descricao: `${cheio.status} · ${cheio.cliente?.razaoSocial ?? ""} · ${cheio.itens.length} item(ns) · R$ ${Number(cheio.valorTotal).toFixed(2)}`,
          snapshot: cheio,
          apagadoPor: auth.session.nome,
        });
      }

      // Pedidos envolvidos: a venda + o(s) pedido(s) de entrega da origem (à ordem).
      const entregas = await tx.pedidoVenda.findMany({
        where: { pedidoVendaOrigemId: pedido.id },
        select: { id: true },
      });
      const pedidoIds = [pedido.id, ...entregas.map((e) => e.id)];

      // Itens, minutas e devoluções desses pedidos — usados para achar os
      // movimentos a estornar (a devolução gera ENTRADAs com devolucaoId).
      const [itens, minutas, devolucoes] = await Promise.all([
        tx.pedidoVendaItem.findMany({ where: { pedidoVendaId: { in: pedidoIds } }, select: { id: true } }),
        tx.minuta.findMany({ where: { pedidoVendaId: { in: pedidoIds } }, select: { id: true, numero: true } }),
        tx.devolucao.findMany({ where: { pedidoVendaId: { in: pedidoIds } }, select: { id: true } }),
      ]);
      const itemIds = itens.map((i) => i.id);
      const minutaNumeros = minutas.map((m) => m.numero);
      const minutaIds = minutas.map((m) => m.id);
      const devIds = devolucoes.map((d) => d.id);

      // Movimentos de estoque: tag de venda à ordem, documentados pelas minutas,
      // amarrados a um item do pedido OU gerados por devolução do pedido.
      // Estorna o saldo de cada um antes de apagar.
      const movs = await tx.movimentacaoEstoque.findMany({
        where: {
          OR: [
            { vendaOrdemId: pedido.id },
            ...(minutaNumeros.length ? [{ documento: { in: minutaNumeros } }] : []),
            ...(itemIds.length ? [{ pedidoVendaItemId: { in: itemIds } }] : []),
            ...(devIds.length ? [{ devolucaoId: { in: devIds } }] : []),
          ],
        },
        select: { id: true, itemId: true, localEstoqueId: true, clienteDonoId: true, tipo: true, quantidade: true, loteId: true },
      });

      const afetados = new Set<string>();
      const loteIds = new Set<string>();
      for (const mv of movs) {
        if (mv.loteId) loteIds.add(mv.loteId);
        if (!mv.localEstoqueId) continue;
        const qtd = Number(mv.quantidade);
        // Desfaz o efeito no saldo: ENTRADA somou (decrementa); SAIDA tirou (devolve).
        const efeito = mv.tipo === "ENTRADA" ? qtd : mv.tipo === "SAIDA" ? -qtd : 0;
        if (efeito !== 0) {
          await tx.estoqueItem.updateMany({
            where: { itemId: mv.itemId, localEstoqueId: mv.localEstoqueId, clienteDonoId: mv.clienteDonoId ?? null },
            data: { quantidadeAtual: { decrement: efeito } },
          });
        }
        afetados.add(`${mv.itemId}|${mv.localEstoqueId}|${mv.clienteDonoId ?? ""}`);
      }
      if (movs.length) await tx.movimentacaoEstoque.deleteMany({ where: { id: { in: movs.map((m) => m.id) } } });
      // Recalcula a cadeia de saldos dos itens/locais afetados.
      for (const chave of Array.from(afetados)) {
        const [itemId, localEstoqueId, dono] = chave.split("|");
        await recalcularSaldos(tx, itemId, localEstoqueId, dono || null);
      }
      // Remove lotes que ficaram sem movimentos.
      for (const loteId of Array.from(loteIds)) {
        const restantes = await tx.movimentacaoEstoque.count({ where: { loteId } });
        if (restantes === 0) await tx.loteMovimentacao.delete({ where: { id: loteId } }).catch(() => {});
      }

      // Financeiro: contas a receber dos pedidos (venda oficial) + financeiro
      // intragrupo da venda à ordem (CR na origem / CP na empresa da venda).
      const crPedidos = await tx.contaReceber.findMany({ where: { pedidoVendaId: { in: pedidoIds } }, select: { id: true } });
      const alvoIntragrupo = `à ordem ${pedido.numero} `; // espaço final evita casar PV-0141 com PV-01410
      const [crIntra, cpIntra] = await Promise.all([
        tx.contaReceber.findMany({ where: { intragrupo: true, descricao: { contains: alvoIntragrupo } }, select: { id: true } }),
        tx.contaPagar.findMany({ where: { intragrupo: true, descricao: { contains: alvoIntragrupo } }, select: { id: true } }),
      ]);
      const crIds = Array.from(new Set([...crPedidos.map((c) => c.id), ...crIntra.map((c) => c.id)]));
      const cpIds = cpIntra.map((c) => c.id);
      if (crIds.length || cpIds.length) {
        await tx.lancamentoFinanceiro.deleteMany({
          where: { OR: [{ contaReceberId: { in: crIds } }, { contaPagarId: { in: cpIds } }] },
        });
      }
      if (crIds.length) await tx.contaReceber.deleteMany({ where: { id: { in: crIds } } });
      if (cpIds.length) await tx.contaPagar.deleteMany({ where: { id: { in: cpIds } } });

      // Devoluções do pedido: cancela os vales (CreditoCliente) que elas geraram,
      // apaga os estornos em dinheiro (LancamentoFinanceiro com devolucaoId) e
      // remove as devoluções (itens caem em cascata) — nada pode ficar apontando
      // para um pedido que deixou de existir.
      if (devIds.length) {
        await tx.creditoCliente.updateMany({
          where: { origemDevolucaoId: { in: devIds }, status: { not: "CANCELADO" } },
          data: { status: "CANCELADO" },
        });
        await tx.lancamentoFinanceiro.deleteMany({ where: { devolucaoId: { in: devIds } } });
        await tx.devolucao.deleteMany({ where: { id: { in: devIds } } });
      }

      // Movimentos de comodato amarrados aos pedidos (sem FK; remove p/ não orfanar).
      await tx.movimentacaoComodato.deleteMany({ where: { pedidoVendaId: { in: pedidoIds } } });

      // Minutas e pedido(s) de entrega da origem (MinutaItem/itens caem em cascata).
      await tx.minuta.deleteMany({ where: { pedidoVendaId: { in: pedidoIds } } });
      if (entregas.length) await tx.pedidoVenda.deleteMany({ where: { id: { in: entregas.map((e) => e.id) } } });

      // Por fim, a venda (itens e pagamentos caem em cascata).
      await tx.pedidoVenda.delete({ where: { id: pedido.id } });

      // Ids de origem dos lançamentos contábeis da cadeia (VENDA por pedido/CR,
      // RECEBIMENTO por CR, CMV/RECEITA por minuta, DEVOLUCAO por devolução e
      // o lançamento de custo `<devId>#custo`).
      const origemIds = [...pedidoIds, ...crIds, ...minutaIds, ...devIds, ...devIds.map((d) => `${d}#custo`)];

      // CONTÁBIL da empresa da venda DENTRO da transação (atômico): se falhar
      // (ex.: exercício fechado), a exclusão inteira faz rollback — sem órfão.
      if (origemIds.length) {
        await apagarLancamentosContabeis({ empresaId: pedido.empresaId, origemId: { in: origemIds } }, tx);
      }

      return {
        movimentos: movs.length,
        contasReceber: crIds.length,
        contasPagar: cpIds.length,
        minutas: minutaNumeros.length,
        pedidosEntrega: entregas.length,
        devolucoes: devIds.length,
        origemIds,
      };
    });

    // Contabilidade das OUTRAS empresas do grupo (a cadeia da venda à ordem cruza
    // empresas): roda pós-commit com prismaSemEscopo. Não engole o erro: loga p/
    // um eventual órfão ser detectável.
    if (resumo.origemIds.length) {
      await apagarLancamentosContabeis({
        empresaId: { not: pedido.empresaId },
        origemId: { in: resumo.origemIds },
      }).catch((e) => {
        console.error("[DELETE /pedidos-venda] falha ao apagar lançamentos contábeis de outra empresa (possível órfão):", resumo.origemIds, e);
      });
    }

    const { origemIds, ...resp } = resumo;
    void origemIds; // não expor os ids internos na resposta
    return NextResponse.json({ data: { ok: true, ...resp } });
  } catch (err) {
    console.error("[DELETE /api/pedidos-venda/[id]]", err);
    return NextResponse.json(
      { error: "Não foi possível excluir o pedido em cadeia — verifique os registros vinculados e tente novamente." },
      { status: 409 },
    );
  }
}
