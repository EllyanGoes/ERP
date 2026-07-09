export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const { cotacaoFornecedorId, itens, prazoEntregaDias, condicoesPagamento, observacao } = body;

  if (!cotacaoFornecedorId || !itens?.length) {
    return NextResponse.json({ error: "cotacaoFornecedorId e itens são obrigatórios" }, { status: 400 });
  }

  // Verify the CotacaoFornecedor belongs to this cotacao
  const cf = await prisma.cotacaoFornecedor.findFirst({
    where: { id: cotacaoFornecedorId, cotacaoId: params.id },
  });
  if (!cf) return NextResponse.json({ error: "Proposta não encontrada nesta cotação" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    // Update each item price
    for (const item of itens as Array<{
      cotacaoFornecedorItemId: string;
      precoUnitario: number;
      disponivel: boolean;
    }>) {
      const quantidade = await tx.cotacaoFornecedorItem.findUnique({
        where: { id: item.cotacaoFornecedorItemId },
        select: { quantidade: true },
      });

      if (!quantidade) continue;

      const preco = parseFloat(String(item.precoUnitario)) || 0;
      const subtotal = item.disponivel ? preco * parseFloat(String(quantidade.quantidade)) : 0;

      await tx.cotacaoFornecedorItem.update({
        where: { id: item.cotacaoFornecedorItemId },
        data: {
          precoUnitario: preco,
          subtotal,
          disponivel: item.disponivel,
        },
      });
    }

    // Recalculate total for this CotacaoFornecedor — LÍQUIDO (subtotal dos
    // itens − vrDesconto + frete/despesas/seguro já gravados na proposta),
    // como nas rotas fornecedores/*. Antes somava só os subtotais e gravava
    // o BRUTO, quebrando o comparativo e o pedido gerado na aprovação.
    const allItens = await tx.cotacaoFornecedorItem.findMany({
      where: { cotacaoFornecedorId },
      select: { subtotal: true, disponivel: true },
    });

    const subtotal = allItens.reduce((sum, i) => {
      return sum + (i.disponivel ? parseFloat(String(i.subtotal ?? 0)) : 0);
    }, 0);
    const num = (d: unknown) => (d == null ? 0 : parseFloat(String(d)) || 0);
    const total = subtotal - num(cf.vrDesconto) + num(cf.frete) + num(cf.despesas) + num(cf.seguro);

    await tx.cotacaoFornecedor.update({
      where: { id: cotacaoFornecedorId },
      data: {
        status: "RESPONDIDA",
        totalCalculado: total,
        prazoEntregaDias: prazoEntregaDias ?? null,
        condicoesPagamento: condicoesPagamento?.trim() || null,
        observacao: observacao?.trim() || null,
      },
    });

    // Recalculate melhorOpcao across all RESPONDIDA fornecedores
    const respondidas = await tx.cotacaoFornecedor.findMany({
      where: { cotacaoId: params.id, status: "RESPONDIDA" },
      orderBy: { totalCalculado: "asc" },
    });

    if (respondidas.length > 0) {
      const winnerId = respondidas[0].id;
      await tx.cotacaoFornecedor.updateMany({
        where: { cotacaoId: params.id },
        data: { melhorOpcao: false },
      });
      await tx.cotacaoFornecedor.update({
        where: { id: winnerId },
        data: { melhorOpcao: true },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
