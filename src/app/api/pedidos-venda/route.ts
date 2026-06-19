export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { pedidoVendaSchema } from "@/lib/validations/pedido-venda";
import { generateSimpleDocNumber } from "@/lib/utils";
import { recalcPedidoValorTotal } from "@/lib/pedido-totais";
import { notifyPedidoVendaCriado } from "@/lib/notify-pedido-venda";
import { EMPRESA_PADRAO_ID, proximaSequenciaDaEmpresa, empresasDoGrupo } from "@/lib/empresa";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const status = searchParams.get("status") || undefined;
  const pdv = searchParams.get("pdv") === "1";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");

  const where: Record<string, unknown> = {
    AND: [
      q ? {
        OR: [
          { numero: { contains: q, mode: "insensitive" } },
          { numeroOrcamento: { contains: q, mode: "insensitive" } },
          { cliente: { razaoSocial: { contains: q, mode: "insensitive" } } },
          { minutas: { some: { numeroFisico: { contains: q, mode: "insensitive" } } } },
        ],
      } : {},
      status ? { status } : {},
      // Fila do PDV (caixa): pedidos abertos, sem minutas ativas (quem já tem
      // minuta segue o fluxo de entrega), fora do intragrupo e ainda NÃO
      // recebidos — um pedido "minutas manuais"/à ordem fica CONFIRMADO após
      // pagar, então excluímos quem já tem conta a receber PAGA p/ não reaparecer.
      pdv ? {
        status: { in: ["ORCAMENTO", "CONFIRMADO"] },
        intragrupo: false,
        minutas: { none: { status: { not: "CANCELADA" } } },
        contasReceber: { none: { status: "PAGA" } },
      } : {},
    ],
  };

  const [data, total] = await Promise.all([
    prisma.pedidoVenda.findMany({
      where,
      include: {
        cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        vendedor: { select: { id: true, nome: true } },
        minutas: { select: { numeroFisico: true } },
        // Venda à ordem (triangular): estoque sai de outra empresa do grupo.
        estoqueOrigemEmpresa: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        // Pedido de ENTREGA à ordem (lado da matriz): aponta p/ a venda de origem.
        pedidoVendaOrigem: { select: { id: true, numero: true, empresa: { select: { id: true, razaoSocial: true, nomeFantasia: true } } } },
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
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = pedidoVendaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  // Natureza financeira e condição de pagamento são obrigatórias na criação
  // (no schema ficam opcionais para não travar a edição de pedidos legados).
  if (!parsed.data.naturezaFinanceiraId) {
    return NextResponse.json({ error: "Natureza financeira é obrigatória" }, { status: 400 });
  }
  if (!parsed.data.condicaoPagamento) {
    return NextResponse.json({ error: "Condição de pagamento é obrigatória" }, { status: 400 });
  }

  const { itens, pagamentos, ...pedidoData } = parsed.data;

  // Comodato (saída) lançado junto com o pedido. Lido do corpo bruto porque o
  // schema do pedido descarta chaves desconhecidas. Entra no mesmo livro-razão
  // (MovimentacaoComodato) da tela /comodato, atualizando o saldo do cliente.
  const comodatoRaw: Array<Record<string, unknown>> = Array.isArray(body.comodato) ? body.comodato : [];
  const comodato = comodatoRaw
    .filter((c) => c && typeof c.itemId === "string" && c.itemId && Number(c.quantidade) > 0)
    .map((c) => ({
      itemId:        c.itemId as string,
      quantidade:    Number(c.quantidade),
      valorUnitario: c.valorUnitario != null ? Number(c.valorUnitario) : null,
      documento:     typeof c.documento === "string" && c.documento.trim() ? c.documento.trim() : null,
    }));

  // Multiempresa: a venda pode nascer para outra empresa do grupo (modo
  // grupo). Valida contra as empresas da sessão; numeração da empresa dona.
  const session = await getSession();
  const empresasPermitidas = session?.empresaIds ?? [];
  let empresaAlvo = session?.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  if (body.empresaId && body.empresaId !== empresaAlvo) {
    if (!empresasPermitidas.includes(body.empresaId)) {
      return NextResponse.json({ error: "Empresa não permitida para este usuário" }, { status: 403 });
    }
    empresaAlvo = body.empresaId;
  }

  // Venda à ordem (triangular): estoque sai de OUTRA empresa do grupo. Lido do
  // corpo bruto (o schema descarta chaves desconhecidas). A origem pode ser
  // QUALQUER empresa ativa do grupo — mesmo que o vendedor não tenha acesso a
  // ela (ex.: vendedor da Cimento aciona o estoque da Tramontin). A baixa na
  // origem roda com prismaSemEscopo na minuta.
  let estoqueOrigemEmpresaId: string | null = null;
  let precoTransferencia: number | null = null;
  if (body.estoqueOrigemEmpresaId) {
    if (body.estoqueOrigemEmpresaId === empresaAlvo) {
      return NextResponse.json({ error: "A empresa de origem do estoque deve ser diferente da empresa da venda" }, { status: 400 });
    }
    const grupo = await empresasDoGrupo();
    if (!grupo.some((e) => e.id === body.estoqueOrigemEmpresaId)) {
      return NextResponse.json({ error: "Empresa de origem inválida" }, { status: 400 });
    }
    estoqueOrigemEmpresaId = body.estoqueOrigemEmpresaId as string;
    precoTransferencia = body.precoTransferencia != null && Number(body.precoTransferencia) > 0
      ? Number(body.precoTransferencia)
      : null;
  }

  const numero = generateSimpleDocNumber("PV", await proximaSequenciaDaEmpresa(empresaAlvo, "PV"));

  const pedido = await prisma.$transaction(async (tx) => {

    // Calculate totals
    const valorProdutos = itens.reduce((sum, i) => sum + i.valorTotal, 0);
    const valorTotal = valorProdutos - (pedidoData.valorDesconto ?? 0) + (pedidoData.valorFrete ?? 0);

    const novoPedido = await tx.pedidoVenda.create({
      data: {
        ...pedidoData,
        numero,
        empresaId: empresaAlvo,
        // Necessidades do pedido (substituem a escolha de modalidade); modalidade
        // fica DERIVADA da entrega p/ os relatórios legados continuarem somando.
        necessidadePagamento: pedidoData.necessidadePagamento ?? "A_PRAZO",
        necessidadeEntrega:   pedidoData.necessidadeEntrega ?? "ENTREGA",
        modalidade: (pedidoData.necessidadeEntrega ?? "ENTREGA") === "RETIRADA" ? "BALCAO" : "AGENDADA",
        estoqueOrigemEmpresaId,
        precoTransferencia,
        valorProdutos,
        valorTotal,
        dataEmissao: pedidoData.dataEmissao ? new Date(pedidoData.dataEmissao) : new Date(),
        dataEntrega: pedidoData.dataEntrega ? new Date(pedidoData.dataEntrega) : null,
        itens: {
          create: itens.map((item) => ({
            itemId:        item.itemId,
            quantidade:    item.quantidade,
            precoUnitario: item.precoUnitario,
            precoTransferencia: estoqueOrigemEmpresaId && item.precoTransferencia != null && Number(item.precoTransferencia) > 0
              ? Number(item.precoTransferencia) : null,
            descontoPct:   item.descontoPct   ?? 0,
            valorDesconto: item.valorDesconto ?? 0,
            desconto:      item.desconto      ?? 0,
            valorTotal:    item.valorTotal,
          })),
        },
        ...(pagamentos && pagamentos.length > 0
          ? { pagamentos: { create: pagamentos.map((p, i) => ({ forma: p.forma, valor: p.valor, ordem: i })) } }
          : {}),
      },
      include: {
        cliente: true,
        empresa: { select: { razaoSocial: true, nomeFantasia: true } },
        itens: { include: { item: true } },
      },
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
