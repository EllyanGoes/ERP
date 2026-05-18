export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateSimpleDocNumber } from "@/lib/utils";

export async function GET() {
  const data = await prisma.pedidoCompra.findMany({
    include: {
      fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      cotacao: { select: { id: true, numero: true } },
      _count: { select: { itens: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    fornecedorId, cotacaoId, dataEntregaPrevista, observacoes, itens = [],
    frete, tipoFrete, desconto, vrDesconto, despesas, seguro,
    condicoesPagamento, contato, email,
  } = body;

  if (!fornecedorId) return NextResponse.json({ error: "Fornecedor obrigatório" }, { status: 400 });
  if (!itens.length)  return NextResponse.json({ error: "Adicione pelo menos um item" }, { status: 400 });

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

    return tx.pedidoCompra.create({
      data: {
        numero,
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
        itens: { create: parsedItens },
      },
      include: {
        fornecedor: { select: { id: true, razaoSocial: true } },
        itens: { include: { item: { select: { id: true, codigo: true, descricao: true } } } },
      },
    });
  });

  return NextResponse.json({ data: pedido }, { status: 201 });
}
