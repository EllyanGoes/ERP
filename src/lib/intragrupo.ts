// ─────────────────────────────────────────────────────────────────────────────
// Operação espelhada entre empresas do grupo (multiempresa — Fase 4).
//
// Uma venda cujo cliente é o cadastro-Cliente de outra empresa do grupo gera,
// automaticamente, os documentos correspondentes do lado COMPRADOR:
//   • confirmação da venda  → PedidoCompra espelhado (status CONFIRMADO);
//   • conta a receber       → ContaPagar espelhada;
//   • minuta ENTREGUE       → ENTRADA de estoque na empresa compradora.
// Tudo marcado com `intragrupo: true` e vinculado pelos campos *EspelhoId —
// é o que permite eliminar a dupla contagem no consolidado (Fase 5).
//
// IMPORTANTE: este módulo usa `prismaSemEscopo` com empresaId explícito em
// tudo — o proxy escopado da sessão amarraria as escritas à empresa VENDEDORA.
// As funções são idempotentes (verificam se o espelho já existe) e devem ser
// chamadas APÓS o commit da operação do lado vendedor; falhas aqui são
// logadas e não derrubam a operação original (use os logs para reprocessar).
// ─────────────────────────────────────────────────────────────────────────────
import { Prisma } from "@prisma/client";
import { prismaSemEscopo } from "@/lib/prisma";
import { generateDocNumber, generateSimpleDocNumber } from "@/lib/utils";

type Tx = Prisma.TransactionClient;

async function proximaSequencia(tx: Tx, empresaId: string, prefixo: string): Promise<number> {
  const seq = await tx.sequencia.upsert({
    where: { empresaId_prefixo: { empresaId, prefixo } },
    update: { ultimo: { increment: 1 } },
    create: { empresaId, prefixo, ultimo: 1 },
  });
  return seq.ultimo;
}

/** Empresa do grupo cujo cadastro-Cliente é `clienteId` (null = cliente comum). */
async function empresaCompradora(clienteId: string, vendedoraId: string) {
  return prismaSemEscopo.empresa.findFirst({
    where: { clienteId, ativo: true, id: { not: vendedoraId } },
  });
}

function nomeEmpresa(e: { nomeFantasia: string | null; razaoSocial: string }) {
  return e.nomeFantasia ?? e.razaoSocial;
}

/**
 * Venda confirmada → cria o PedidoCompra espelhado na empresa compradora.
 * Chame após a transição de status para CONFIRMADO.
 */
export async function espelharConfirmacaoVenda(pedidoVendaId: string): Promise<void> {
  try {
    const pedido = await prismaSemEscopo.pedidoVenda.findUnique({
      where: { id: pedidoVendaId },
      include: { itens: true, empresa: true, espelhoCompra: true },
    });
    if (!pedido || pedido.status !== "CONFIRMADO") return;
    if (pedido.espelhoCompra) return; // já espelhado

    const compradora = await empresaCompradora(pedido.clienteId, pedido.empresaId);
    if (!compradora) return; // venda comum, fora do grupo

    const fornecedorId = pedido.empresa.fornecedorId;
    if (!fornecedorId) {
      console.error(`[intragrupo] empresa ${pedido.empresaId} sem cadastro de Fornecedor — espelho da venda ${pedido.numero} não criado`);
      return;
    }

    await prismaSemEscopo.$transaction(async (tx) => {
      const numero = generateSimpleDocNumber("PC", await proximaSequencia(tx, compradora.id, "PC"));
      await tx.pedidoCompra.create({
        data: {
          empresaId: compradora.id,
          numero,
          fornecedorId,
          status: "CONFIRMADO",
          valorTotal: pedido.valorTotal,
          descricao: `Compra intragrupo — venda ${pedido.numero} (${nomeEmpresa(pedido.empresa)})`,
          observacoes: `Gerado automaticamente ao confirmar a venda ${pedido.numero} da ${nomeEmpresa(pedido.empresa)}.`,
          intragrupo: true,
          pedidoVendaEspelhoId: pedido.id,
          itens: {
            create: pedido.itens.map((i) => ({
              itemId: i.itemId,
              quantidade: i.quantidade,
              precoUnitario: i.precoUnitario,
              valorTotal: i.valorTotal,
            })),
          },
        },
      });
      await tx.pedidoVenda.update({ where: { id: pedido.id }, data: { intragrupo: true } });
    });
  } catch (e) {
    console.error(`[intragrupo] falha ao espelhar confirmação da venda ${pedidoVendaId}:`, e);
  }
}

/** Venda cancelada → cancela o PedidoCompra espelhado (se houver). */
export async function cancelarEspelhoVenda(pedidoVendaId: string): Promise<void> {
  try {
    const espelho = await prismaSemEscopo.pedidoCompra.findUnique({
      where: { pedidoVendaEspelhoId: pedidoVendaId },
    });
    if (!espelho || espelho.status === "CANCELADO") return;
    await prismaSemEscopo.pedidoCompra.update({
      where: { id: espelho.id },
      data: {
        status: "CANCELADO",
        observacoes: `${espelho.observacoes ?? ""}\nCancelado junto com a venda de origem (intragrupo).`.trim(),
      },
    });
  } catch (e) {
    console.error(`[intragrupo] falha ao cancelar espelho da venda ${pedidoVendaId}:`, e);
  }
}

/**
 * Conta a receber de cliente do grupo → cria a ContaPagar espelhada na
 * empresa compradora. Chame após criar a(s) conta(s) a receber.
 */
export async function espelharContaReceber(contaReceberId: string): Promise<void> {
  try {
    const cr = await prismaSemEscopo.contaReceber.findUnique({
      where: { id: contaReceberId },
      include: { empresa: true, espelhoPagar: true },
    });
    if (!cr || cr.espelhoPagar) return;

    const compradora = await empresaCompradora(cr.clienteId, cr.empresaId);
    if (!compradora) return;

    const fornecedorId = cr.empresa.fornecedorId;
    if (!fornecedorId) {
      console.error(`[intragrupo] empresa ${cr.empresaId} sem cadastro de Fornecedor — espelho da CR ${cr.numero} não criado`);
      return;
    }

    await prismaSemEscopo.$transaction(async (tx) => {
      const numero = generateDocNumber("CP", await proximaSequencia(tx, compradora.id, "CP"));
      await tx.contaPagar.create({
        data: {
          empresaId: compradora.id,
          numero,
          fornecedorId,
          descricao: `Intragrupo: ${cr.descricao}`,
          valorOriginal: cr.valorOriginal,
          dataVencimento: cr.dataVencimento,
          parcelaNumero: cr.parcelaNumero,
          parcelaTotal: cr.parcelaTotal,
          status: "ABERTA",
          observacoes: `Espelho da conta a receber ${cr.numero} (${nomeEmpresa(cr.empresa)}).`,
          intragrupo: true,
          contaReceberEspelhoId: cr.id,
        },
      });
      await tx.contaReceber.update({ where: { id: cr.id }, data: { intragrupo: true } });
    });
  } catch (e) {
    console.error(`[intragrupo] falha ao espelhar conta a receber ${contaReceberId}:`, e);
  }
}

/**
 * Minuta ENTREGUE de venda intragrupo → ENTRADA de estoque na compradora
 * (local padrão, criado se necessário), com lote e saldos atualizados.
 */
export async function espelharEntregaMinuta(minutaId: string): Promise<void> {
  try {
    const minuta = await prismaSemEscopo.minuta.findUnique({
      where: { id: minutaId },
      include: {
        itens: { include: { pedidoVendaItem: true } },
        pedidoVenda: { include: { empresa: true } },
      },
    });
    if (!minuta || minuta.status !== "ENTREGUE") return;

    const pedido = minuta.pedidoVenda;
    const compradora = await empresaCompradora(pedido.clienteId, pedido.empresaId);
    if (!compradora) return;

    // idempotência: entrada desta minuta já registrada na compradora?
    const jaTem = await prismaSemEscopo.movimentacaoEstoque.findFirst({
      where: { empresaId: compradora.id, tipo: "ENTRADA", documento: minuta.numero },
      select: { id: true },
    });
    if (jaTem) return;

    await prismaSemEscopo.$transaction(async (tx) => {
      // local de estoque padrão da compradora (cria na primeira entrada)
      let local = await tx.localEstoque.findFirst({
        where: { empresaId: compradora.id, ativo: true },
        orderBy: { createdAt: "asc" },
      });
      if (!local) {
        local = await tx.localEstoque.create({
          data: {
            empresaId: compradora.id,
            nome: "Principal",
            descricao: "Criado automaticamente no primeiro recebimento intragrupo",
          },
        });
      }

      const ano = new Date().getFullYear();
      const seq = await proximaSequencia(tx, compradora.id, "MOV");
      const lote = await tx.loteMovimentacao.create({
        data: {
          empresaId: compradora.id,
          numero: `MOV-${ano}-${String(seq).padStart(4, "0")}`,
          tipo: "ENTRADA",
          documento: minuta.numero,
          observacoes: `Recebimento intragrupo — minuta ${minuta.numero} (${nomeEmpresa(pedido.empresa)})`,
        },
      });

      for (const item of minuta.itens) {
        const qtd = new Prisma.Decimal(item.quantidadeConvertida ?? item.quantidade);
        if (qtd.lte(0)) continue;

        const estoque = await tx.estoqueItem.findFirst({
          where: { empresaId: compradora.id, itemId: item.itemId, localEstoqueId: local.id },
        });
        const saldoAntes = new Prisma.Decimal(estoque?.quantidadeAtual ?? 0);
        const saldoDepois = saldoAntes.add(qtd);

        await tx.movimentacaoEstoque.create({
          data: {
            empresaId: compradora.id,
            itemId: item.itemId,
            tipo: "ENTRADA",
            quantidade: qtd,
            saldoAntes,
            saldoDepois,
            documento: minuta.numero,
            observacoes: `Recebimento intragrupo da minuta ${minuta.numero} (${nomeEmpresa(pedido.empresa)})`,
            localEstoqueId: local.id,
            loteId: lote.id,
            valorUnitario: item.pedidoVendaItem.precoUnitario,
          },
        });

        if (estoque) {
          await tx.estoqueItem.update({
            where: { id: estoque.id },
            data: { quantidadeAtual: saldoDepois },
          });
        } else {
          await tx.estoqueItem.create({
            data: {
              empresaId: compradora.id,
              itemId: item.itemId,
              localEstoqueId: local.id,
              quantidadeAtual: saldoDepois,
              quantidadeMin: 0,
            },
          });
        }
      }
    });
  } catch (e) {
    console.error(`[intragrupo] falha ao espelhar entrega da minuta ${minutaId}:`, e);
  }
}
