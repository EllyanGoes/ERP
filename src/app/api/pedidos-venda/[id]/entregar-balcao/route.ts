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
import { generateSimpleDocNumber } from "@/lib/utils";
import { pedidoPrintData } from "@/lib/print-pedido-server";
import { baixarEstoqueVenda } from "@/lib/baixa-estoque";
import { SaldoNegativoError, respostaSaldoNegativo } from "@/lib/estoque-guard";
import { faturarEntregasPedido } from "@/lib/contas-receber";
import { contabilizarPedidoVenda } from "@/lib/contabilidade";
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
  // Venda à ordem: a saída/baixa é feita no Pedido de Entrega da empresa de
  // origem (Tramontin), não aqui.
  if (pedido.estoqueOrigemEmpresaId) {
    return NextResponse.json({ error: "Venda à ordem: a saída do material é feita no pedido de entrega da empresa de origem." }, { status: 422 });
  }
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
          tipo: pedido.necessidadeEntrega === "RETIRADA" ? "RETIRADA" : "ENTREGA",
          status: "ENTREGUE",
          dataEntrega: hoje,
          observacoes: pedido.necessidadeEntrega === "RETIRADA"
            ? "Saída do material — retirada total na loja"
            : "Saída do material — entrega total",
          itens: {
            create: pedido.itens.map((it) => ({
              pedidoVendaItemId: it.id,
              itemId: it.itemId,
              quantidade: it.quantidade,
            })),
          },
        },
      });

      {
        const lote = await tx.loteMovimentacao.create({
          data: {
            empresaId: pedido.empresaId,
            numero: movNumero,
            tipo: "SAIDA",
            documento: minuta.numero,
            observacoes: `Saída balcão ${pedido.numero} — minuta ${minuta.numero}`,
          },
        });

        // Baixa UNIFICADA (src/lib/baixa-estoque.ts): cada item sai do SEU local
        // (categoria/saldo — o local informado é só fallback; antes baixava TUDO
        // no local único, um bug) com hard block de saldo negativo.
        const descrs = await tx.item.findMany({
          where: { id: { in: pedido.itens.map((i) => i.itemId) } },
          select: { id: true, descricao: true },
        });
        const descrDe = new Map(descrs.map((d) => [d.id, d.descricao]));
        await baixarEstoqueVenda(tx, {
          empresaId: pedido.empresaId,
          itens: pedido.itens.map((item) => ({
            itemId: item.itemId,
            quantidade: parseFloat(item.quantidade.toString()),
            pedidoVendaItemId: item.id,
            descricao: descrDe.get(item.itemId) ?? null,
          })),
          fallbackLocalId: localEstoqueId,
          documento: minuta.numero,
          observacoes: `Saída balcão — minuta ${minuta.numero}`,
          loteId: lote.id,
        });
      }

      return { minuta };
    });

    // Faturamento na ENTREGA: a retirada total acabou de se completar — gera o
    // contas a receber (idempotente; pula se o recebimento já criou o título) e
    // contabiliza o pedido.
    await faturarEntregasPedido(params.id).catch((e) =>
      console.error(`[entregar-balcao] faturarEntregasPedido(${params.id}) falhou:`, e));
    await contabilizarPedidoVenda(params.id).catch(() => {});

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
    if (err instanceof SaldoNegativoError) return respostaSaldoNegativo(err);
    const msg = err instanceof Error ? err.message : "Erro ao registrar saída do material";
    if (msg.startsWith("CONFLITO:")) return NextResponse.json({ error: msg.replace("CONFLITO: ", "") }, { status: 409 });
    console.error("[POST /api/pedidos-venda/[id]/entregar-balcao]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
