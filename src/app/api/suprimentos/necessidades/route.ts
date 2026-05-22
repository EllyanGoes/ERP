export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateSimpleDocNumber } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filialId = searchParams.get("filialId");
  const status   = searchParams.get("status");

  const data = await prisma.necessidadeCompra.findMany({
    where: {
      AND: [
        filialId ? { filialId } : {},
        status   ? { status: status as never } : {},
      ],
    },
    include: {
      filial:       { select: { id: true, razaoSocial: true } },
      localEstoque: { select: { id: true, nome: true } },
      centroCusto:  { select: { id: true, codigo: true, nome: true } },
      setor:        { select: { id: true, nome: true } },
      _count:       { select: { itens: true } },
      cotacoes: {
        select: {
          id: true, numero: true, status: true,
          pedidos: {
            select: {
              id: true, numero: true, status: true,
              conferencia: { select: { id: true, numero: true, status: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" as const },
      },
      pedidosCompra: {
        select: {
          id: true, numero: true, status: true,
          conferencia: { select: { id: true, numero: true, status: true } },
        },
        orderBy: { createdAt: "asc" as const },
      },
      itens: {
        include: {
          item: {
            select: {
              id: true, codigo: true, descricao: true, unidadeMedida: true,
              unidade: { select: { sigla: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  try {
  const body = await req.json();

  if (!body.filialId) {
    return NextResponse.json({ error: "Filial é obrigatória" }, { status: 400 });
  }
  if (!body.localEstoqueId) {
    return NextResponse.json({ error: "Local de Estoque é obrigatório" }, { status: 400 });
  }
  if (!body.motivo?.trim()) {
    return NextResponse.json({ error: "Motivo de compra é obrigatório" }, { status: 400 });
  }
  if (!body.itens || body.itens.length === 0) {
    return NextResponse.json({ error: "Adicione pelo menos um item" }, { status: 400 });
  }

  const necessidade = await prisma.$transaction(async (tx) => {
    const seq = await tx.sequencia.upsert({
      where:  { prefixo: "SC" },
      create: { prefixo: "SC", ultimo: 1 },
      update: { ultimo: { increment: 1 } },
    });

    const numero = generateSimpleDocNumber("SC", seq.ultimo);

    const record = await tx.necessidadeCompra.create({
      data: {
        numero,
        status:               "RASCUNHO",
        solicitante:          body.solicitante?.trim()           || null,
        colaboradorId:        body.colaboradorId                 || null,
        setorId:              body.setorId                       || null,
        justificativa:        body.justificativa?.trim()         || null,
        dataNecessidade:      body.dataNecessidade ? new Date(body.dataNecessidade) : null,
        observacoes:          body.observacoes?.trim()           || null,
        filialId:             body.filialId                      || null,
        prioridade:           body.prioridade ? parseInt(String(body.prioridade)) : 3,
        localEstoqueId:       body.localEstoqueId                || null,
        centroCustoId:        body.centroCustoId                 || null,
        tipoCompra:           body.tipoCompra?.trim()            || null,
        motivo:               body.motivo?.trim()                || null,
        categoria:            body.categoria?.trim()             || null,
        projeto:              body.projeto?.trim()               || null,
        classificacaoAuxiliar: body.classificacaoAuxiliar?.trim() || null,
        itens: {
          create: body.itens.map((item: { itemId: string; quantidade: number; observacao?: string; unidade?: string }) => ({
            itemId:     item.itemId,
            quantidade: parseFloat(String(item.quantidade)),
            observacao: item.observacao?.trim() || null,
            unidade:    item.unidade?.trim()    || null,
          })),
        },
      },
      include: { itens: true },
    });

    return record;
  });

  return NextResponse.json({ data: necessidade }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /necessidades]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
