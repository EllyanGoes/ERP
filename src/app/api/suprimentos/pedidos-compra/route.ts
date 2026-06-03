export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateSimpleDocNumber } from "@/lib/utils";
import { findMatchingCotacoes } from "@/lib/cotacao-match";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = (searchParams.get("search") || "").trim();
  const semDE = searchParams.get("semDE") === "1" || searchParams.get("semDE") === "true";
  const limitParam = parseInt(searchParams.get("limit") || "", 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : undefined;

  // ── Modo busca / vincular ──────────────────────────────────────────────────
  // Usado ao vincular um Pedido de Compra a um Documento de Entrada
  // (/suprimentos/conferencias/novo). Filtra por número ou nome do fornecedor,
  // limita os resultados e — diferente da listagem — inclui os `itens` (com o
  // item), pois a tela usa esses dados para pré-preencher a conferência.
  // Pedidos CANCELADOS não aparecem (não há o que receber). Com semDE=1, lista
  // só os PCs ainda SEM Documento de Entrada — os "em aberto" para vincular —
  // mesmo sem termo de busca (popover já abre com a lista).
  if (search || semDE) {
    const where: Prisma.PedidoCompraWhereInput = { status: { not: "CANCELADO" } };
    if (semDE) where.conferencia = { is: null };
    if (search) {
      where.OR = [
        { numero: { contains: search, mode: "insensitive" } },
        { fornecedor: { razaoSocial: { contains: search, mode: "insensitive" } } },
        { fornecedor: { nomeFantasia: { contains: search, mode: "insensitive" } } },
      ];
    }
    const data = await prisma.pedidoCompra.findMany({
      where,
      select: {
        id: true,
        numero: true,
        valorTotal: true,
        fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        itens: {
          select: {
            id: true,
            quantidade: true,
            precoUnitario: true,
            item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit ?? (search ? 10 : 20),
    });
    return NextResponse.json({ data });
  }

  // ── Listagem completa (tela de Pedidos de Compra) ──────────────────────────
  const data = await prisma.pedidoCompra.findMany({
    include: {
      fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      cotacao: {
        select: {
          id: true, numero: true,
          necessidade: {
            select: {
              id: true, numero: true, solicitante: true,
              justificativa: true,
              centroCusto: { select: { nome: true } },
              localEstoque: { select: { nome: true } },
            },
          },
        },
      },
      _count: { select: { itens: true } },
      conferencia: { select: { id: true, numero: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    fornecedorId, cotacaoId, dataEntregaPrevista, observacoes, itens = [],
    frete, tipoFrete, desconto, despesas, seguro,
    condicoesPagamento, contato, email, descricao, confirmAvulso,
  } = body;

  if (!fornecedorId) return NextResponse.json({ error: "Fornecedor obrigatório" }, { status: 400 });
  if (!itens.length)  return NextResponse.json({ error: "Adicione pelo menos um item" }, { status: 400 });

  // ── Anti-duplicidade: avisar se já existe Cotação aberta compatível ────────
  // Quando o PC é avulso (sem cotacaoId) e o usuário ainda não confirmou,
  // verifica se há Cotação aberta do mesmo fornecedor com itens em comum — para
  // evitar duplicar o fluxo de compra (a Cotação geraria seu próprio PC ao ser
  // formalizada). O front mostra o aviso e reenvia com confirmAvulso=true.
  if (!cotacaoId && !confirmAvulso) {
    const itemIds = (itens as Array<{ itemId: string }>).map((i) => i.itemId).filter(Boolean);
    const matches = await findMatchingCotacoes(fornecedorId, itemIds);
    if (matches.length > 0) {
      return NextResponse.json({ error: "COTACAO_COMPATIVEL", matches }, { status: 409 });
    }
  }

  // ── Impedir mais de um PC ativo para a mesma SC ───────────────────────────
  if (cotacaoId) {
    const cotacao = await prisma.cotacaoCompra.findUnique({
      where: { id: cotacaoId },
      select: { necessidadeId: true },
    });
    if (cotacao?.necessidadeId) {
      const existingPC = await prisma.pedidoCompra.findFirst({
        where: {
          cotacao: { necessidadeId: cotacao.necessidadeId },
          status: { not: "CANCELADO" },
        },
        select: { numero: true },
      });
      if (existingPC) {
        return NextResponse.json(
          { error: `Já existe o Pedido de Compra ${existingPC.numero} ativo para esta Solicitação. Cancele-o antes de criar um novo.` },
          { status: 409 }
        );
      }
    }
  }

  const pedido = await prisma.$transaction(async (tx) => {
    const seq = await tx.sequencia.upsert({
      where:  { prefixo: "PC" },
      create: { prefixo: "PC", ultimo: 1 },
      update: { ultimo: { increment: 1 } },
    });
    const numero = generateSimpleDocNumber("PC", seq.ultimo);

    const parsedItens = itens.map((i: { itemId: string; quantidade: number; precoUnitario: number }) => ({
      itemId:       i.itemId,
      quantidade:   parseFloat(String(i.quantidade)),
      precoUnitario: parseFloat(String(i.precoUnitario)),
      valorTotal:   parseFloat(String(i.quantidade)) * parseFloat(String(i.precoUnitario)),
    }));

    const subtotal    = parsedItens.reduce((s: number, i: { valorTotal: number }) => s + i.valorTotal, 0);
    const descontoVal = desconto  != null ? (subtotal * parseFloat(String(desconto)))  / 100 : 0;
    const freteVal    = frete     != null ? parseFloat(String(frete))    : 0;
    const despesasVal = despesas  != null ? parseFloat(String(despesas)) : 0;
    const seguroVal   = seguro    != null ? parseFloat(String(seguro))   : 0;
    const valorTotal  = subtotal - descontoVal + freteVal + despesasVal + seguroVal;

    const pedido = await tx.pedidoCompra.create({
      data: {
        numero,
        status:             "AGUARDANDO_PAGAMENTO",
        fornecedorId,
        cotacaoId:          cotacaoId || null,
        valorTotal,
        dataEntregaPrevista: dataEntregaPrevista ? new Date(dataEntregaPrevista) : null,
        observacoes:         observacoes?.trim() || null,
        frete:               frete    != null ? parseFloat(String(frete))    : null,
        tipoFrete:           tipoFrete || null,
        desconto:            desconto  != null ? parseFloat(String(desconto)) : null,
        vrDesconto:          descontoVal > 0   ? descontoVal                 : null,
        despesas:            despesas  != null ? parseFloat(String(despesas)) : null,
        seguro:              seguro    != null ? parseFloat(String(seguro))   : null,
        condicoesPagamento:  condicoesPagamento || null,
        contato:             contato?.trim() || null,
        email:               email?.trim()   || null,
        descricao:           descricao?.trim() || null,
        itens: { create: parsedItens },
      },
      include: {
        fornecedor: { select: { id: true, razaoSocial: true } },
        itens: { include: { item: { select: { id: true, codigo: true, descricao: true } } } },
      },
    });

    // Auto-inherit descricao from SC.justificativa when linked to a cotação
    if (cotacaoId && !pedido.descricao) {
      const sc = await tx.cotacaoCompra.findUnique({
        where: { id: cotacaoId },
        select: { necessidade: { select: { justificativa: true } } },
      });
      const inherited = sc?.necessidade?.justificativa?.trim();
      if (inherited) {
        await tx.pedidoCompra.update({
          where: { id: pedido.id },
          data: { descricao: inherited },
        });
        (pedido as { descricao?: string | null }).descricao = inherited;
      }
    }

    // Update necessidade status when a pedido is placed
    if (cotacaoId) {
      const cotacao = await tx.cotacaoCompra.findUnique({
        where: { id: cotacaoId },
        select: {
          necessidadeId: true,
          necessidade: {
            select: {
              itens: { select: { itemId: true } },
            },
          },
        },
      });

      if (cotacao?.necessidadeId && cotacao.necessidade) {
        // Check how many distinct itemIds from the necessidade already have a pedido
        const necessidadeId = cotacao.necessidadeId;
        const necessidadeItemIds = new Set(cotacao.necessidade.itens.map((i) => i.itemId));

        // Get all pedido items linked (via cotacao) to this necessidade
        const pedidosExistentes = await tx.pedidoCompra.findMany({
          where: { cotacaoId },
          select: { itens: { select: { itemId: true } } },
        });

        const atendidosIds = new Set(
          pedidosExistentes.flatMap((p) => p.itens.map((i) => i.itemId))
        );

        const totalNec    = necessidadeItemIds.size;
        const totalAtend  = Array.from(necessidadeItemIds).filter((id) => atendidosIds.has(id)).length;

        const novoStatus =
          totalNec > 0 && totalAtend >= totalNec
            ? "TOTALMENTE_ATENDIDA"
            : "PARCIALMENTE_ATENDIDA";

        await tx.necessidadeCompra.updateMany({
          where: {
            id: necessidadeId,
            status: { in: ["EM_COTACAO", "APROVADA", "PARCIALMENTE_ATENDIDA"] },
          },
          data: { status: novoStatus },
        });
      }
    }

    // ── Auto-vincular itens ao fornecedor em ProdutoFornecedor ────────────────
    // Cria o vínculo apenas se ainda não existir (equivale a upsert com skip)
    for (const item of pedido.itens) {
      const exists = await tx.produtoFornecedor.findFirst({
        where: { itemId: item.item.id, fornecedorId },
        select: { id: true },
      });
      if (!exists) {
        await tx.produtoFornecedor.create({
          data: { itemId: item.item.id, fornecedorId },
        });
      }
    }

    return pedido;
  });

  return NextResponse.json({ data: pedido }, { status: 201 });
}
