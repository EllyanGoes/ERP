export const dynamic = "force-dynamic";
// Venda balcão (retirada na loja): o caixa recebe o pagamento e conclui o
// pedido em uma ação só — minuta de RETIRADA criada já ENTREGUE com baixa de
// estoque, conta a receber nasce PAGA e o recebimento é lançado na conta
// indicada (padrão Caixa Geral). Fluxo da Cimento e Mix; pedidos com entrega
// continuam no fluxo normal de minutas.
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { proximaSequenciaDaEmpresa } from "@/lib/empresa";
import { generateDocNumber, generateSimpleDocNumber } from "@/lib/utils";
import { z } from "zod";

const schema = z.object({
  localEstoqueId: z.string().min(1, "Informe o local de estoque da retirada"),
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
  const { localEstoqueId, formaPagamento, contaBancariaId, dataRecebimento } = parsed.data;

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
        // data confirmada pelo caixa prevalece sobre a previsão do pedido
        data: { status: "CONCLUIDO", dataEntrega: dataRecebimento ? hoje : (pedido.dataEntrega ?? hoje) },
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

      // Recebimento à vista: a conta nasce PAGA e o dinheiro entra na conta
      // indicada (padrão Caixa Geral) — nada fica em aberto no contas a receber.
      let conta = null;
      if (valorTotal > 0 && numeroCR) {
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
            formaPagamento: formaPagamento ?? pedido.formaPagamento,
          },
        });

        await tx.lancamentoFinanceiro.create({
          data: {
            empresaId: pedido.empresaId,
            tipo: "RECEITA",
            descricao: `Recebimento ${numeroCR} — venda balcão ${pedido.numero}`,
            valor: valorTotal,
            dataLancamento: hoje,
            contaReceberId: conta.id,
            contaBancariaId: contaBancariaId || "caixa-geral",
          },
        });
      }

      return { minuta, conta };
    });

    return NextResponse.json({ data: { minutaId: resultado.minuta.id, minutaNumero: resultado.minuta.numero, contaNumero: resultado.conta?.numero ?? null } }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao concluir venda balcão";
    if (msg.startsWith("CONFLITO:")) return NextResponse.json({ error: msg.replace("CONFLITO: ", "") }, { status: 409 });
    console.error("[POST /api/pedidos-venda/[id]/balcao]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
