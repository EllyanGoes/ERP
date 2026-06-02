export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pedidoVendaSchema } from "@/lib/validations/pedido-venda";
import { generateSimpleDocNumber } from "@/lib/utils";
import { recalcPedidoValorTotal } from "@/lib/pedido-totais";
import { notifyPedidoVendaCriado } from "@/lib/notify-pedido-venda";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const status = searchParams.get("status") || undefined;
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");

  const where: any = {
    AND: [
      q ? {
        OR: [
          { numero: { contains: q, mode: "insensitive" } },
          { cliente: { razaoSocial: { contains: q, mode: "insensitive" } } },
        ],
      } : {},
      status ? { status } : {},
    ],
  };

  const [data, total] = await Promise.all([
    prisma.pedidoVenda.findMany({
      where,
      include: {
        cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        _count: { select: { minutas: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.pedidoVenda.count({ where }),
  ]);

  return NextResponse.json({ data, total, page, limit });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = pedidoVendaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { itens, ...pedidoData } = parsed.data;

  // Comodato (saída) lançado junto com o pedido. Lido do corpo bruto porque o
  // schema do pedido descarta chaves desconhecidas. Entra no mesmo livro-razão
  // (MovimentacaoComodato) da tela /comodato, atualizando o saldo do cliente.
  const comodatoRaw: any[] = Array.isArray(body.comodato) ? body.comodato : [];
  const comodato = comodatoRaw
    .filter((c) => c && typeof c.itemId === "string" && c.itemId && Number(c.quantidade) > 0)
    .map((c) => ({
      itemId:        c.itemId as string,
      quantidade:    Number(c.quantidade),
      valorUnitario: c.valorUnitario != null ? Number(c.valorUnitario) : null,
      documento:     typeof c.documento === "string" && c.documento.trim() ? c.documento.trim() : null,
    }));

  const pedido = await prisma.$transaction(async (tx) => {
    // Generate sequence number
    const seq = await tx.sequencia.upsert({
      where: { prefixo: "PV" },
      update: { ultimo: { increment: 1 } },
      create: { prefixo: "PV", ultimo: 1 },
    });
    const numero = generateSimpleDocNumber("PV", seq.ultimo);

    // Calculate totals
    const valorProdutos = itens.reduce((sum, i) => sum + i.valorTotal, 0);
    const valorTotal = valorProdutos - (pedidoData.valorDesconto ?? 0) + (pedidoData.valorFrete ?? 0);

    const novoPedido = await tx.pedidoVenda.create({
      data: {
        ...pedidoData,
        numero,
        valorProdutos,
        valorTotal,
        dataEmissao: pedidoData.dataEmissao ? new Date(pedidoData.dataEmissao) : new Date(),
        dataEntrega: pedidoData.dataEntrega ? new Date(pedidoData.dataEntrega) : null,
        itens: {
          create: itens.map((item) => ({
            itemId:        item.itemId,
            quantidade:    item.quantidade,
            precoUnitario: item.precoUnitario,
            descontoPct:   item.descontoPct   ?? 0,
            valorDesconto: item.valorDesconto ?? 0,
            desconto:      item.desconto      ?? 0,
            valorTotal:    item.valorTotal,
          })),
        },
      },
      include: { cliente: true, itens: { include: { item: true } } },
    });

    // Movimentações de comodato (SAÍDA) amarradas ao pedido recém-criado.
    if (comodato.length > 0) {
      const dataMov = pedidoData.dataEmissao ? new Date(pedidoData.dataEmissao) : new Date();
      // valorUnitario é obrigatório; quando não informado, usa o preço de venda do item.
      const semValor = comodato.filter((c) => c.valorUnitario == null).map((c) => c.itemId);
      const precos = semValor.length
        ? await tx.item.findMany({ where: { id: { in: semValor } }, select: { id: true, precoVenda: true } })
        : [];
      const precoMap = new Map(precos.map((p) => [p.id, Number(p.precoVenda)]));

      await tx.movimentacaoComodato.createMany({
        data: comodato.map((c) => ({
          clienteId:     pedidoData.clienteId,
          itemId:        c.itemId,
          tipo:          "SAIDA" as const,
          quantidade:    c.quantidade,
          valorUnitario: c.valorUnitario ?? precoMap.get(c.itemId) ?? 0,
          origem:        "AUTOMATICO" as const,
          pedidoVendaId: novoPedido.id,
          data:          dataMov,
          documento:     c.documento,
        })),
      });

      // O comodato entra no total do pedido → recalcula valorTotal já com a saída.
      await recalcPedidoValorTotal(tx, novoPedido.id);
    }

    return novoPedido;
  });

  // Avisa o grupo do Telegram a cada novo pedido (não bloqueia em caso de erro).
  await notifyPedidoVendaCriado(pedido);

  return NextResponse.json({ data: pedido }, { status: 201 });
}
