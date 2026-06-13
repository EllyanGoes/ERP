export const dynamic = "force-dynamic";
// Venda balcão (retirada na loja): o caixa recebe o pagamento e conclui o
// pedido em uma ação só — minuta de RETIRADA criada já ENTREGUE com baixa de
// estoque, conta a receber nasce PAGA e o recebimento é lançado na conta
// indicada (padrão Caixa Geral). Fluxo da Cimento e Mix; pedidos com entrega
// continuam no fluxo normal de minutas.
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { proximaSequenciaDaEmpresa, contaCaixaIdDaEmpresa } from "@/lib/empresa";
import { recomputarStatusPedido } from "@/lib/pedido-totais";
import { generateDocNumber, generateSimpleDocNumber } from "@/lib/utils";
import { pedidoPrintData } from "@/lib/print-pedido-server";
import { z } from "zod";

const pagamentoSchema = z.object({
  forma: z.string().min(1),
  contaBancariaId: z.string().optional().nullable(),
  valor: z.coerce.number().min(0),
  troco: z.boolean().optional(), // linha em dinheiro: pode exceder o total (devolve troco)
});

const schema = z.object({
  localEstoqueId: z.string().min(1, "Informe o local de estoque da retirada"),
  // Pagamento misto: várias formas com valores. Mantém os campos únicos como
  // fallback (fluxo de 1 forma).
  pagamentos: z.array(pagamentoSchema).optional(),
  formaPagamento: z.string().optional().nullable(),
  contaBancariaId: z.string().optional().nullable(),
  // Data do recebimento/conclusão (YYYY-MM-DD) — o caixa confirma; vazio = hoje.
  dataRecebimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const { localEstoqueId, pagamentos: pagamentosIn, formaPagamento, contaBancariaId, dataRecebimento } = parsed.data;

  const pedido = await prisma.pedidoVenda.findUnique({
    where: { id: params.id },
    include: {
      itens: true,
      minutas: { where: { status: { not: "CANCELADA" } }, select: { id: true } },
    },
  });
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  if (!["ORCAMENTO", "CONFIRMADO"].includes(pedido.status)) {
    return NextResponse.json({ error: `Pedido ${pedido.status.toLowerCase()} não pode ser concluído no balcão.` }, { status: 422 });
  }
  if (pedido.intragrupo) {
    return NextResponse.json({ error: "Venda entre empresas do grupo segue o fluxo normal de confirmação e entrega." }, { status: 422 });
  }
  if (pedido.minutas.length > 0) {
    return NextResponse.json({ error: "Este pedido já possui minutas — conclua pelo fluxo de entrega." }, { status: 422 });
  }
  if (pedido.itens.length === 0) {
    return NextResponse.json({ error: "Pedido sem itens." }, { status: 422 });
  }

  // Dia confirmado pelo caixa (ou hoje em horário de Brasília), gravado como
  // meia-noite UTC (padrão dos campos de data).
  const hojeSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const hoje = new Date(`${dataRecebimento || hojeSP}T00:00:00.000Z`);
  const valorTotal = parseFloat(pedido.valorTotal.toString());

  // ── Normaliza as formas de pagamento ──────────────────────────────────────
  // Pagamento misto: usa a lista `pagamentos`; sem ela, cai no fluxo de 1 forma
  // (formaPagamento + contaBancariaId únicos pelo valor total).
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const caixaPadrao = contaCaixaIdDaEmpresa(pedido.empresaId);
  const linhas = (pagamentosIn && pagamentosIn.length > 0)
    ? pagamentosIn.map((p) => ({
        forma: p.forma,
        contaBancariaId: p.contaBancariaId || caixaPadrao,
        valor: round2(p.valor),
        troco: !!p.troco,
      }))
    : [{
        forma: (formaPagamento ?? pedido.formaPagamento ?? "À vista"),
        contaBancariaId: contaBancariaId || caixaPadrao,
        valor: valorTotal,
        troco: false,
      }];

  if (valorTotal > 0) {
    const somaPag = round2(linhas.reduce((s, l) => s + l.valor, 0));
    if (somaPag < valorTotal - 0.001) {
      return NextResponse.json({ error: `Pagamento insuficiente: faltam R$ ${round2(valorTotal - somaPag).toFixed(2)}.` }, { status: 422 });
    }
    // O excesso (troco) só pode sair das linhas de dinheiro (troco=true).
    const troco = round2(somaPag - valorTotal);
    const totalTroco = round2(linhas.filter((l) => l.troco).reduce((s, l) => s + l.valor, 0));
    if (troco > 0.001 && troco > totalTroco + 0.001) {
      return NextResponse.json({ error: "O troco excede o valor recebido em dinheiro." }, { status: 422 });
    }
    // Abate o troco da(s) linha(s) de dinheiro para o total recebido fechar
    // com o valor da venda (o troco devolvido não entra no caixa).
    let restanteTroco = troco;
    for (const l of linhas) {
      if (restanteTroco <= 0.001) break;
      if (!l.troco) continue;
      const abate = Math.min(l.valor, restanteTroco);
      l.valor = round2(l.valor - abate);
      restanteTroco = round2(restanteTroco - abate);
    }
  }
  // Linhas efetivas com valor > 0 (após abater troco), resumo das formas.
  const linhasReais = linhas.filter((l) => l.valor > 0.001);
  const formasResumo = Array.from(new Set(linhasReais.map((l) => l.forma))).join(" + ")
    || (formaPagamento ?? pedido.formaPagamento ?? null);

  // Numeração da empresa DONA do pedido (modo grupo pode operar outra empresa).
  const numeroMin = generateSimpleDocNumber("MIN", await proximaSequenciaDaEmpresa(pedido.empresaId, "MIN"));
  const seqMov = await proximaSequenciaDaEmpresa(pedido.empresaId, "MOV");
  const movNumero = `MOV-${new Date().getFullYear()}-${String(seqMov).padStart(4, "0")}`;
  const numeroCR = valorTotal > 0
    ? generateDocNumber("CR", await proximaSequenciaDaEmpresa(pedido.empresaId, "CR"))
    : null;

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      // Trava a conclusão: só UMA requisição move o pedido para CONCLUIDO.
      // Duplo clique no caixa não pode baixar estoque nem receber duas vezes.
      const claimed = await tx.pedidoVenda.updateMany({
        where: { id: params.id, status: { in: ["ORCAMENTO", "CONFIRMADO"] } },
        // data confirmada pelo caixa prevalece sobre a previsão do pedido; a
        // forma de pagamento confirmada fica carimbada no pedido (e no cupom)
        data: {
          status: "CONCLUIDO",
          dataEntrega: dataRecebimento ? hoje : (pedido.dataEntrega ?? hoje),
          dataConclusao: hoje, // venda de balcão conclui na data do recebimento
          ...(formasResumo ? { formaPagamento: formasResumo } : {}),
        },
      });
      if (claimed.count === 0) {
        throw new Error("CONFLITO: o pedido já foi concluído por outra operação — recarregue a página.");
      }

      const minuta = await tx.minuta.create({
        data: {
          numero: numeroMin,
          empresaId: pedido.empresaId,
          pedidoVendaId: pedido.id,
          localEstoqueId,
          tipo: "RETIRADA",
          status: "ENTREGUE",
          dataEntrega: hoje,
          observacoes: "Venda balcão — retirada na loja",
          itens: {
            create: pedido.itens.map((it) => ({
              pedidoVendaItemId: it.id,
              itemId: it.itemId,
              quantidade: it.quantidade,
            })),
          },
        },
      });

      const lote = await tx.loteMovimentacao.create({
        data: {
          empresaId: pedido.empresaId,
          numero: movNumero,
          tipo: "SAIDA",
          documento: minuta.numero,
          observacoes: `Venda balcão ${pedido.numero} — minuta ${minuta.numero}`,
        },
      });

      for (const item of pedido.itens) {
        const quantidade = parseFloat(item.quantidade.toString());

        let estoque = await tx.estoqueItem.findFirst({
          where: { empresaId: pedido.empresaId, itemId: item.itemId, localEstoqueId, clienteDonoId: null },
        });
        if (!estoque) {
          estoque = await tx.estoqueItem.create({
            data: { empresaId: pedido.empresaId, itemId: item.itemId, localEstoqueId, quantidadeAtual: 0, quantidadeMin: 0, clienteDonoId: null },
          });
        }

        // decrement atômico: o saldo da linha deriva do valor pós-update.
        const atualizado = await tx.estoqueItem.update({
          where: { id: estoque.id },
          data: { quantidadeAtual: { decrement: quantidade } },
        });
        const saldoDepois = parseFloat(atualizado.quantidadeAtual.toString());

        await tx.movimentacaoEstoque.create({
          data: {
            empresaId: pedido.empresaId,
            itemId: item.itemId,
            localEstoqueId,
            loteId: lote.id,
            pedidoVendaItemId: item.id,
            tipo: "SAIDA",
            quantidade,
            saldoAntes: saldoDepois + quantidade,
            saldoDepois,
            documento: minuta.numero,
            observacoes: `Venda balcão — minuta ${minuta.numero}`,
          },
        });
      }

      // Recebimento à vista: o dinheiro entra na conta indicada. Se o pedido JÁ
      // tem título(s) em aberto (gerado na confirmação), eles são RECEBIDOS
      // (baixados) — não cria outro. Senão, cria uma conta já PAGA.
      let conta: { id: string; numero: string } | null = null;
      if (valorTotal > 0) {
        const abertos = await tx.contaReceber.findMany({
          where: { pedidoVendaId: pedido.id, status: { in: ["ABERTA", "PARCIAL", "VENCIDA"] } },
          orderBy: [{ parcelaNumero: "asc" }, { dataVencimento: "asc" }],
          select: { id: true, numero: true, valorOriginal: true },
        });
        if (abertos.length > 0) {
          for (const ab of abertos) {
            await tx.contaReceber.update({
              where: { id: ab.id },
              data: { valorPago: ab.valorOriginal, dataPagamento: hoje, status: "PAGA", formaPagamento: formasResumo },
            });
          }
          conta = { id: abertos[0].id, numero: abertos[0].numero };
        } else if (numeroCR) {
          conta = await tx.contaReceber.create({
            data: {
              empresaId: pedido.empresaId,
              numero: numeroCR,
              clienteId: pedido.clienteId,
              pedidoVendaId: pedido.id,
              descricao: `Venda balcão ${pedido.numero}`,
              valorOriginal: valorTotal,
              valorPago: valorTotal,
              dataVencimento: hoje,
              dataPagamento: hoje,
              status: "PAGA",
              formaPagamento: formasResumo,
            },
            select: { id: true, numero: true },
          });
        }
      }
      if (conta) {
        // Um lançamento por forma de pagamento (cada um na sua conta). A soma
        // dos lançamentos fecha com o valor da venda (troco já abatido).
        for (const l of linhasReais) {
          await tx.lancamentoFinanceiro.create({
            data: {
              empresaId: pedido.empresaId,
              tipo: "RECEITA",
              descricao: `Recebimento ${conta.numero} — venda balcão ${pedido.numero}${linhasReais.length > 1 ? ` (${l.forma})` : ""}`,
              valor: l.valor,
              dataLancamento: hoje,
              contaReceberId: conta.id,
              contaBancariaId: l.contaBancariaId,
            },
          });
        }

        // Registra no pedido as formas REAIS recebidas, com a conta de destino
        // (ex.: PIX → Banco X), para o detalhe mostrar onde cada forma caiu.
        await tx.pedidoVendaPagamento.deleteMany({ where: { pedidoVendaId: pedido.id } });
        await tx.pedidoVendaPagamento.createMany({
          data: linhasReais.map((l, i) => ({
            pedidoVendaId: pedido.id,
            forma: l.forma,
            valor: l.valor,
            ordem: i,
            contaBancariaId: l.contaBancariaId,
          })),
        });
      }

      await recomputarStatusPedido(tx, pedido.id);
      return { minuta, conta };
    });

    // Dados de impressão do cupom (o PDV imprime direto da resposta).
    const pedidoImpresso = await prisma.pedidoVenda.findUnique({
      where: { id: params.id },
      include: {
        cliente: true,
        empresa: true,
        vendedor: { select: { nome: true } },
        itens: { include: { item: { include: { unidade: { select: { sigla: true } } } } } },
      },
    });

    return NextResponse.json({
      data: {
        minutaId: resultado.minuta.id,
        minutaNumero: resultado.minuta.numero,
        contaNumero: resultado.conta?.numero ?? null,
        print: pedidoImpresso ? pedidoPrintData(pedidoImpresso) : null,
      },
    }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao concluir venda balcão";
    if (msg.startsWith("CONFLITO:")) return NextResponse.json({ error: msg.replace("CONFLITO: ", "") }, { status: 409 });
    console.error("[POST /api/pedidos-venda/[id]/balcao]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
