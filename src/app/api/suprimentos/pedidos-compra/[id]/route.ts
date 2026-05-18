export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const record = await prisma.pedidoCompra.findUnique({
    where: { id: params.id },
    include: {
      fornecedor: {
        select: {
          id: true, razaoSocial: true, nomeFantasia: true,
          cpfCnpj: true, contato: true, email: true,
        },
      },
      cotacao: { select: { id: true, numero: true, nome: true } },
      itens: {
        include: { item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } } },
      },
      conferencia: { select: { id: true, numero: true, status: true } },
    },
  });

  if (!record) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  // Fetch CotacaoFornecedor to get proposal details — fallback to PedidoCompra own fields for manual PCs
  let cotacaoFornecedor = null;
  if (record.cotacaoId && record.fornecedorId) {
    const allCfs = await prisma.cotacaoFornecedor.findMany({
      where: { cotacaoId: record.cotacaoId },
      orderBy: { id: "asc" },
    });
    const cfIndex = allCfs.findIndex((cf) => cf.fornecedorId === record.fornecedorId);
    const cf = allCfs[cfIndex];
    if (cf) cotacaoFornecedor = { ...cf, propostaNumero: cfIndex + 1 };
  }

  // For manual PCs (no cotação), build cotacaoFornecedor-shaped object from PC own fields
  if (!cotacaoFornecedor) {
    cotacaoFornecedor = {
      propostaNumero: 1,
      frete:              record.frete,
      tipoFrete:          record.tipoFrete,
      desconto:           record.desconto,
      vrDesconto:         record.vrDesconto,
      despesas:           record.despesas,
      seguro:             record.seguro,
      condicoesPagamento: record.condicoesPagamento,
      prazoEntregaDias:   null,
    };
  }

  return NextResponse.json({ data: { ...record, cotacaoFornecedor } });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const pedidoId = params.id;

  if (body.edit === true) {
    // Full edit mode: delete all existing items, create new ones, update all fields
    const itens: Array<{ itemId: string; quantidade: number; precoUnitario: number; situacao?: string }> =
      body.itens ?? [];

    const subtotal = itens.reduce((s, it) => {
      const situacao = it.situacao ?? "CONSIDERA";
      if (situacao !== "CONSIDERA") return s;
      return s + (Number(it.quantidade) || 0) * (Number(it.precoUnitario) || 0);
    }, 0);

    const descontoVal  = Number(body.desconto)  || 0;
    const freteVal     = Number(body.frete)      || 0;
    const despesasVal  = Number(body.despesas)   || 0;
    const seguroVal    = Number(body.seguro)      || 0;
    const vrDescontoCalc = (subtotal * descontoVal) / 100;
    const valorTotal   = subtotal - vrDescontoCalc + freteVal + despesasVal + seguroVal;

    const record = await prisma.$transaction(async (tx) => {
      await tx.pedidoCompraItem.deleteMany({ where: { pedidoId } });

      await tx.pedidoCompraItem.createMany({
        data: itens.map((it) => ({
          pedidoId,
          itemId:       it.itemId,
          quantidade:   Number(it.quantidade),
          precoUnitario: Number(it.precoUnitario) || 0,
          valorTotal:   (Number(it.quantidade) || 0) * (Number(it.precoUnitario) || 0),
          situacao:     (it.situacao ?? "CONSIDERA") as string,
        })),
      });

      return tx.pedidoCompra.update({
        where: { id: pedidoId },
        data: {
          fornecedorId:        body.fornecedorId       || undefined,
          contato:             body.contato            ?? null,
          email:               body.email              ?? null,
          frete:               freteVal                || null,
          tipoFrete:           body.tipoFrete          || null,
          desconto:            descontoVal             || null,
          vrDesconto:          vrDescontoCalc          || null,
          despesas:            despesasVal             || null,
          seguro:              seguroVal               || null,
          condicoesPagamento:  body.condicoesPagamento || null,
          dataEntregaPrevista: body.dataEntregaPrevista ? new Date(body.dataEntregaPrevista) : null,
          observacoes:         body.observacoes        || null,
          valorTotal,
        },
      });
    });

    return NextResponse.json({ data: record });
  }

  // Default: partial update (status / dataEntregaPrevista / observacoes)
  const updateData: Record<string, unknown> = {};
  if (body.status !== undefined) updateData.status = body.status;
  if (body.dataEntregaPrevista !== undefined)
    updateData.dataEntregaPrevista = body.dataEntregaPrevista ? new Date(body.dataEntregaPrevista) : null;
  if (body.observacoes !== undefined) updateData.observacoes = body.observacoes || null;

  const record = await prisma.pedidoCompra.update({
    where: { id: pedidoId },
    data: updateData,
  });

  return NextResponse.json({ data: record });
}
