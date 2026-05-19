export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateDocNumber } from "@/lib/utils";

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
        where: { prefixo: "CF" },
        create: { prefixo: "CF", ultimo: 1 },
        update: { ultimo: { increment: 1 } },
      });
      const numero = generateDocNumber("CF", seq.ultimo);

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

  // ── Path B: Standalone Doc. Entrada ───────────────────────────────────────
  const {
    fornecedorId,
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

  const conferencia = await prisma.$transaction(async (tx) => {
    const seq = await tx.sequencia.upsert({
      where: { prefixo: "DE" },
      create: { prefixo: "DE", ultimo: 1 },
      update: { ultimo: { increment: 1 } },
    });
    const numero = generateDocNumber("DE", seq.ultimo);

    const record = await tx.conferenciaCompra.create({
      data: {
        numero,
        status: "PENDENTE",
        fornecedorId,
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
          create: itens.map((it: { itemId: string; quantidadePedida: number | string; vlrUnitario?: number | string | null; localEstoqueId?: string | null }) => {
            const qtd = parseFloat(String(it.quantidadePedida));
            const vlrUnit = it.vlrUnitario != null ? parseFloat(String(it.vlrUnitario)) : null;
            const vlrTot = vlrUnit != null ? qtd * vlrUnit : null;
            return {
              itemId: it.itemId,
              quantidadePedida: qtd,
              quantidadeRecebida: 0,
              vlrUnitario: vlrUnit,
              vlrTotal: vlrTot,
              localEstoqueId: it.localEstoqueId || null,
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

    return record;
  });

  return NextResponse.json({ data: conferencia }, { status: 201 });
}
