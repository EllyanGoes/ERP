export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // Body: { fornecedorId, condicoesPagamento?, frete?, tipoFrete?, desconto?, vrDesconto?, despesas?, seguro?, itens: [{itemId, quantidade, precoUnitario}] }
  const body = await req.json();
  const { fornecedorId, condicoesPagamento, frete, tipoFrete, desconto, vrDesconto, despesas, seguro, itens = [] } = body;

  if (!fornecedorId) return NextResponse.json({ error: "Fornecedor obrigatório" }, { status: 400 });
  if (!itens.length) return NextResponse.json({ error: "Nenhum item encontrado" }, { status: 400 });

  // Check if supplier is already in this cotação
  const existing = await prisma.cotacaoFornecedor.findUnique({
    where: { cotacaoId_fornecedorId: { cotacaoId: params.id, fornecedorId } },
  });
  if (existing) return NextResponse.json({ error: "Este fornecedor já participa desta cotação" }, { status: 409 });

  // Compute totalCalculado
  const parsedItens = itens.map((i: { itemId: string; quantidade: number; precoUnitario: number }) => ({
    itemId: i.itemId,
    quantidade: parseFloat(String(i.quantidade)) || 0,
    precoUnitario: parseFloat(String(i.precoUnitario)) || 0,
    subtotal: (parseFloat(String(i.quantidade)) || 0) * (parseFloat(String(i.precoUnitario)) || 0),
    disponivel: (parseFloat(String(i.precoUnitario)) || 0) > 0,
    situacao: "CONSIDERA",
  }));

  const freteVal    = frete     != null ? parseFloat(String(frete))    : 0;
  const despesasVal = despesas  != null ? parseFloat(String(despesas)) : 0;
  const seguroVal   = seguro    != null ? parseFloat(String(seguro))   : 0;
  const descontoVal = desconto  != null ? parseFloat(String(desconto)) : 0;
  const subtotal    = parsedItens.reduce((s: number, i: { subtotal: number }) => s + i.subtotal, 0);
  const vrDesc      = vrDesconto != null ? parseFloat(String(vrDesconto)) : (subtotal * descontoVal) / 100;
  const total       = subtotal - vrDesc + freteVal + despesasVal + seguroVal;

  const hasPrecos = parsedItens.some((i: { precoUnitario: number }) => i.precoUnitario > 0);

  const cf = await prisma.cotacaoFornecedor.create({
    data: {
      cotacaoId:          params.id,
      fornecedorId,
      status:             hasPrecos ? "RESPONDIDA" : "AGUARDANDO",
      condicoesPagamento: condicoesPagamento || null,
      frete:              frete     != null ? parseFloat(String(frete))    : null,
      tipoFrete:          tipoFrete || null,
      desconto:           desconto  != null ? parseFloat(String(desconto)) : null,
      vrDesconto:         vrDesc    > 0     ? vrDesc                       : null,
      despesas:           despesas  != null ? parseFloat(String(despesas)) : null,
      seguro:             seguro    != null ? parseFloat(String(seguro))   : null,
      totalCalculado:     total,
      itens: {
        create: parsedItens.map((i: { itemId: string; quantidade: number; precoUnitario: number; subtotal: number; disponivel: boolean; situacao: string }) => ({
          itemId:       i.itemId,
          quantidade:   i.quantidade,
          precoUnitario: i.precoUnitario || null,
          subtotal:     i.subtotal,
          disponivel:   i.disponivel,
          situacao:     i.situacao,
        })),
      },
    },
    include: {
      fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      itens: { include: { item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } } } },
    },
  });

  // If has prices, recalculate melhorOpcao
  if (hasPrecos) {
    const respondidas = await prisma.cotacaoFornecedor.findMany({
      where: { cotacaoId: params.id, status: "RESPONDIDA" },
      orderBy: { totalCalculado: "asc" },
    });
    if (respondidas.length > 0) {
      await prisma.cotacaoFornecedor.updateMany({ where: { cotacaoId: params.id }, data: { melhorOpcao: false } });
      await prisma.cotacaoFornecedor.update({ where: { id: respondidas[0].id }, data: { melhorOpcao: true } });
    }
  }

  // Also update cotação status to EM_ANALISE if it was PENDENTE
  await prisma.cotacaoCompra.update({
    where: { id: params.id },
    data: { status: "EM_ANALISE" },
  }).catch(() => {}); // ignore if already EM_ANALISE

  return NextResponse.json({ data: cf }, { status: 201 });
}
