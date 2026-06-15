export const dynamic = "force-dynamic";
// Confirmar a SAÍDA do material de uma venda balcão (retirada na loja) como passo
// SEPARADO do recebimento: o cliente já comprou (e normalmente já pagou via
// "Registrar Recebimento"), mas só agora retira a mercadoria. Cria a minuta de
// RETIRADA já ENTREGUE com baixa de estoque e conclui o pedido — SEM mexer no
// financeiro (o recebimento, se houver, já foi lançado à parte). Espelha a baixa
// de estoque da venda balcão, sem a parte de pagamento.
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { proximaSequenciaDaEmpresa } from "@/lib/empresa";
import { gerarMovimentosTriangulares } from "@/lib/venda-ordem";
import { generateSimpleDocNumber } from "@/lib/utils";
import { pedidoPrintData } from "@/lib/print-pedido-server";
import { z } from "zod";

const schema = z.object({
  localEstoqueId: z.string().min(1, "Informe o local de estoque da retirada"),
  // Data da saída/retirada (YYYY-MM-DD); vazio = hoje em Brasília.
  dataSaida: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const { localEstoqueId, dataSaida } = parsed.data;

  const pedido = await prisma.pedidoVenda.findUnique({
    where: { id: params.id },
    include: {
      itens: true,
      minutas: { where: { status: { not: "CANCELADA" } }, select: { id: true } },
    },
  });
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  if (["CONCLUIDO", "CANCELADO"].includes(pedido.status)) {
    return NextResponse.json({ error: `Pedido ${pedido.status.toLowerCase()} não pode ter saída de material registrada.` }, { status: 422 });
  }
  if (pedido.intragrupo) {
    return NextResponse.json({ error: "Venda entre empresas do grupo segue o fluxo normal de entrega." }, { status: 422 });
  }
  // Venda à ordem: o estoque sai de outra empresa. A baixa normal é pulada e os
  // movimentos virtuais são gerados após o commit (gerarMovimentosTriangulares).
  const triangular = !!pedido.estoqueOrigemEmpresaId;
  if (pedido.minutas.length > 0) {
    return NextResponse.json({ error: "Este pedido já possui minutas — use o fluxo de entrega." }, { status: 422 });
  }
  if (pedido.itens.length === 0) {
    return NextResponse.json({ error: "Pedido sem itens." }, { status: 422 });
  }

  const hojeSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const hoje = new Date(`${dataSaida || hojeSP}T00:00:00.000Z`);

  // Numeração da empresa DONA do pedido.
  const numeroMin = generateSimpleDocNumber("MIN", await proximaSequenciaDaEmpresa(pedido.empresaId, "MIN"));
  const seqMov = await proximaSequenciaDaEmpresa(pedido.empresaId, "MOV");
  const movNumero = `MOV-${new Date().getFullYear()}-${String(seqMov).padStart(4, "0")}`;

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      // Trava: só UMA requisição conclui o pedido / baixa o estoque.
      const claimed = await tx.pedidoVenda.updateMany({
        where: { id: params.id, status: { notIn: ["CONCLUIDO", "CANCELADO"] } },
        data: {
          status: "CONCLUIDO",
          dataEntrega: dataSaida ? hoje : (pedido.dataEntrega ?? hoje),
          dataConclusao: hoje,
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
          observacoes: "Venda balcão — saída do material (retirada na loja)",
          itens: {
            create: pedido.itens.map((it) => ({
              pedidoVendaItemId: it.id,
              itemId: it.itemId,
              quantidade: it.quantidade,
            })),
          },
        },
      });

      // Venda à ordem: pula a baixa normal — movimentos virtuais após o commit.
      if (!triangular) {
        const lote = await tx.loteMovimentacao.create({
          data: {
            empresaId: pedido.empresaId,
            numero: movNumero,
            tipo: "SAIDA",
            documento: minuta.numero,
            observacoes: `Saída balcão ${pedido.numero} — minuta ${minuta.numero}`,
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
              observacoes: `Saída balcão — minuta ${minuta.numero}`,
            },
          });
        }
      }

      return { minuta };
    });

    // Venda à ordem: gera os 3 movimentos virtuais + financeiro intragrupo.
    if (triangular) await gerarMovimentosTriangulares(resultado.minuta.id);

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
        print: pedidoImpresso ? pedidoPrintData(pedidoImpresso) : null,
      },
    }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao registrar saída do material";
    if (msg.startsWith("CONFLITO:")) return NextResponse.json({ error: msg.replace("CONFLITO: ", "") }, { status: 409 });
    console.error("[POST /api/pedidos-venda/[id]/entregar-balcao]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
