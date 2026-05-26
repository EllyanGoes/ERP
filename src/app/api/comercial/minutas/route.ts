export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateSimpleDocNumber } from "@/lib/utils";

// ── GET /api/comercial/minutas ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const pedidoVendaId = searchParams.get("pedidoVendaId");
    const status = searchParams.get("status");

    const minutas = await prisma.minuta.findMany({
      where: {
        ...(pedidoVendaId ? { pedidoVendaId } : {}),
        ...(status ? { status: status as never } : {}),
      },
      include: {
        pedidoVenda: {
          select: {
            id: true,
            numero: true,
            cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
          },
        },
        localEstoque: { select: { id: true, nome: true } },
        itens: {
          include: {
            item: { select: { id: true, codigo: true, descricao: true } },
            unidade: { select: { id: true, sigla: true, nome: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: minutas });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── POST /api/comercial/minutas ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { pedidoVendaId, localEstoqueId, dataEntrega, motorista, placa, observacoes, itens } = body;

    if (!pedidoVendaId) {
      return NextResponse.json({ error: "pedidoVendaId é obrigatório" }, { status: 400 });
    }
    if (!itens || itens.length === 0) {
      return NextResponse.json({ error: "Informe ao menos um item" }, { status: 400 });
    }

    const minuta = await prisma.$transaction(async (tx) => {
      // Generate sequential number MIN-0001
      const seq = await tx.sequencia.upsert({
        where:  { prefixo: "MIN" },
        create: { prefixo: "MIN", ultimo: 1 },
        update: { ultimo: { increment: 1 } },
      });
      const numero = generateSimpleDocNumber("MIN", seq.ultimo);

      const created = await tx.minuta.create({
        data: {
          numero,
          pedidoVendaId,
          localEstoqueId: localEstoqueId || null,
          status: "PENDENTE",
          dataEntrega: dataEntrega ? new Date(dataEntrega) : null,
          motorista: motorista || null,
          placa: placa || null,
          observacoes: observacoes || null,
          itens: {
            create: itens.map((it: {
              pedidoVendaItemId: string;
              itemId: string;
              quantidade: number;
              quantidadeConvertida?: number;
              unidadeId?: string;
            }) => ({
              pedidoVendaItemId: it.pedidoVendaItemId,
              itemId: it.itemId,
              quantidade: it.quantidade,
              quantidadeConvertida: it.quantidadeConvertida ?? null,
              unidadeId: it.unidadeId || null,
            })),
          },
        },
        include: {
          pedidoVenda: {
            select: {
              id: true,
              numero: true,
              cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
            },
          },
          localEstoque: { select: { id: true, nome: true } },
          itens: {
            include: {
              item: { select: { id: true, codigo: true, descricao: true } },
              unidade: { select: { id: true, sigla: true, nome: true } },
            },
          },
        },
      });

      // Move pedido to EM_PRODUCAO when first minuta is created
      await tx.pedidoVenda.update({
        where: { id: pedidoVendaId },
        data: { status: "EM_PRODUCAO" },
      });

      return created;
    });

    return NextResponse.json({ data: minuta }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/comercial/minutas]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
