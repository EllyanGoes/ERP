export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateSimpleDocNumber } from "@/lib/utils";
import { findMatchingPedidos } from "@/lib/pc-match";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";

export async function GET() {
  const data = await prisma.conferenciaCompra.findMany({
    include: {
      pedido: {
        select: {
          id: true,
          numero: true,
          fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        },
      },
      fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      itens: {
        select: {
          id: true,
          vlrTotal: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { pedidoId, observacoes } = body;

  // ── Path A: Create from Pedido ─────────────────────────────────────────────
  if (pedidoId) {
    // Check if conferencia already exists for this pedido
    const existing = await prisma.conferenciaCompra.findUnique({
      where: { pedidoId },
    });
    if (existing) {
      return NextResponse.json({ data: existing });
    }

    const pedido = await prisma.pedidoCompra.findUnique({
      where: { id: pedidoId },
      include: { itens: true },
    });

    if (!pedido) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }

    const conferencia = await prisma.$transaction(async (tx) => {
      const seq = await tx.sequencia.upsert({
        where: { empresaId_prefixo: { empresaId: EMPRESA_PADRAO_ID, prefixo: "DE" } },
        create: { prefixo: "DE", ultimo: 1 },
        update: { ultimo: { increment: 1 } },
      });
      const numero = generateSimpleDocNumber("DE", seq.ultimo);

      const record = await tx.conferenciaCompra.create({
        data: {
          numero,
          pedidoId,
          observacoes: observacoes?.trim() || null,
          itens: {
            create: pedido.itens.map((i) => ({
              itemId: i.itemId,
              quantidadePedida: parseFloat(String(i.quantidade)),
              quantidadeRecebida: 0,
            })),
          },
        },
        include: {
          itens: { include: { item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } } } },
        },
      });

      // Update pedido to EM_TRANSITO
      await tx.pedidoCompra.update({
        where: { id: pedidoId },
        data: { status: "EM_TRANSITO" },
      });

      return record;
    });

    return NextResponse.json({ data: conferencia }, { status: 201 });
  }

  // ── Path B: Full-form Doc. Entrada ────────────────────────────────────────
  const {
    fornecedorId,
    responsavel,
    pedidoId: linkedPedidoId,
    modoLocalEstoque,
    localEstoqueId: globalLocalEstoqueId,
    tipoNota,
    numeroNF,
    serie,
    dtEmissao,
    ufOrigem,
    espDocumento,
    frete,
    tipoFrete,
    seguro,
    despesas,
    desconto,
    itens,
    confirmAvulso,
  } = body;

  if (!fornecedorId) {
    return NextResponse.json({ error: "fornecedorId obrigatório para documento standalone" }, { status: 400 });
  }

  if (!itens || !Array.isArray(itens) || itens.length === 0) {
    return NextResponse.json({ error: "É necessário pelo menos 1 item" }, { status: 400 });
  }

  for (const it of itens) {
    if (!it.itemId) {
      return NextResponse.json({ error: "Cada item deve ter itemId" }, { status: 400 });
    }
    const qtd = parseFloat(String(it.quantidadePedida ?? 0));
    if (!(qtd > 0)) {
      return NextResponse.json({ error: "Cada item deve ter quantidadePedida > 0" }, { status: 400 });
    }
  }

  const fornecedor = await prisma.fornecedor.findUnique({ where: { id: fornecedorId } });
  if (!fornecedor) {
    return NextResponse.json({ error: "Fornecedor não encontrado" }, { status: 404 });
  }

  // ── Impedir mais de um DE para a mesma SC ────────────────────────────────
  if (linkedPedidoId) {
    const pc = await prisma.pedidoCompra.findUnique({
      where: { id: linkedPedidoId },
      select: { cotacao: { select: { necessidadeId: true } } },
    });
    const necessidadeId = pc?.cotacao?.necessidadeId;
    if (necessidadeId) {
      const existingDE = await prisma.conferenciaCompra.findFirst({
        where: { pedido: { cotacao: { necessidadeId } } },
        select: { numero: true },
      });
      if (existingDE) {
        return NextResponse.json(
          { error: `Já existe o Documento de Entrada ${existingDE.numero} para esta Solicitação. Não é possível criar mais de um documento de entrada por solicitação.` },
          { status: 409 }
        );
      }
    }
  }

  // ── Anti-duplicidade: sugerir vínculo com PC compatível ──────────────────
  // Se o DE não está vinculado a um PC e o usuário ainda não confirmou que é um
  // documento avulso, procura Pedidos de Compra do mesmo fornecedor (ainda sem
  // Documento de Entrada) com itens em comum. Se houver candidatos, bloqueia a
  // criação (409) e devolve a lista para o usuário decidir: vincular ou confirmar
  // que é mesmo avulso. Evita DEs órfãos que não dão baixa em SC/PC.
  if (!linkedPedidoId && !confirmAvulso) {
    const itemIds = (itens as Array<{ itemId?: string }>)
      .map((it) => it.itemId)
      .filter((id): id is string => Boolean(id));
    const matches = await findMatchingPedidos(fornecedorId, itemIds);
    if (matches.length > 0) {
      return NextResponse.json(
        {
          error: "PC_COMPATIVEL",
          message:
            "Foram encontrados Pedidos de Compra compatíveis (mesmo fornecedor e itens em comum). Vincule um deles ou confirme que este é um documento avulso.",
          matches,
        },
        { status: 409 }
      );
    }
  }

  const conferencia = await prisma.$transaction(async (tx) => {
    const seq = await tx.sequencia.upsert({
      where: { empresaId_prefixo: { empresaId: EMPRESA_PADRAO_ID, prefixo: "DE" } },
      create: { prefixo: "DE", ultimo: 1 },
      update: { ultimo: { increment: 1 } },
    });
    const numero = generateSimpleDocNumber("DE", seq.ultimo);

    const record = await tx.conferenciaCompra.create({
      data: {
        numero,
        status: "PENDENTE",
        fornecedorId,
        responsavel: responsavel || null,
        pedidoId: linkedPedidoId || null,
        modoLocalEstoque: modoLocalEstoque || "POR_ITEM",
        localEstoqueId: modoLocalEstoque === "GLOBAL" ? (globalLocalEstoqueId || null) : null,
        tipoNota: tipoNota || "NORMAL",
        numeroNF: numeroNF || null,
        serie: serie || null,
        dtEmissao: dtEmissao ? new Date(dtEmissao) : null,
        ufOrigem: ufOrigem || null,
        espDocumento: espDocumento || "SPED",
        frete: frete != null ? parseFloat(String(frete)) : null,
        tipoFrete: tipoFrete || null,
        seguro: seguro != null ? parseFloat(String(seguro)) : null,
        despesas: despesas != null ? parseFloat(String(despesas)) : null,
        desconto: desconto != null ? parseFloat(String(desconto)) : null,
        observacoes: observacoes?.trim() || null,
        itens: {
          create: itens.map((it: {
            itemId: string;
            quantidadePedida: number | string;
            quantidadeRecebida?: number | string;
            vlrUnitario?: number | string | null;
            desconto?: number | string | null;
            vlrTotal?: number | string | null;
            vlrIPI?: number | string | null;
            vlrICMS?: number | string | null;
            localEstoqueId?: string | null;
            tipoEntrada?: string | null;
            codFiscal?: string | null;
          }) => {
            const qtdPed  = parseFloat(String(it.quantidadePedida));
            const qtdRec  = it.quantidadeRecebida != null ? parseFloat(String(it.quantidadeRecebida)) : 0;
            const vlrUnit = it.vlrUnitario != null ? parseFloat(String(it.vlrUnitario)) : null;
            const pct     = it.desconto != null ? parseFloat(String(it.desconto)) : null;
            // Use provided vlrTotal; fallback to auto-calc from qtdRec * vlrUnit
            const vlrTot  = it.vlrTotal != null
              ? parseFloat(String(it.vlrTotal))
              : (vlrUnit != null ? qtdRec * vlrUnit : null);
            return {
              itemId: it.itemId,
              quantidadePedida: qtdPed,
              quantidadeRecebida: qtdRec,
              vlrUnitario: vlrUnit,
              desconto: pct,
              vlrTotal: vlrTot,
              vlrIPI: it.vlrIPI != null ? parseFloat(String(it.vlrIPI)) : null,
              vlrICMS: it.vlrICMS != null ? parseFloat(String(it.vlrICMS)) : null,
              localEstoqueId: it.localEstoqueId || null,
              tipoEntrada: it.tipoEntrada || null,
              codFiscal: it.codFiscal || null,
            };
          }),
        },
      },
      include: {
        fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        itens: {
          include: {
            item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } },
          },
        },
      },
    });

    // NOTE: PC status is NOT updated here intentionally.
    // The PC will only transition to RECEBIDO when the DE is concluded (concluir endpoint).
    // Changing PC status on DE creation would be premature — items haven't been received yet.

    return record;
  });

  return NextResponse.json({ data: conferencia }, { status: 201 });
}
