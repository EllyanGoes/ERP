export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; fornId: string } }
) {
  const body = await req.json();
  const { status, prazoEntregaDias, condicoesPagamento, observacao, itens } = body;

  const updateData: Record<string, unknown> = {};
  if (status !== undefined) updateData.status = status;
  if (prazoEntregaDias !== undefined) updateData.prazoEntregaDias = prazoEntregaDias ? Number(prazoEntregaDias) : null;
  if (condicoesPagamento !== undefined) updateData.condicoesPagamento = condicoesPagamento || null;
  if (observacao !== undefined) updateData.observacao = observacao || null;

  // Update item prices if provided
  if (itens && Array.isArray(itens)) {
    for (const item of itens) {
      const preco = item.precoUnitario != null ? parseFloat(String(item.precoUnitario)) : null;
      const qtd = item.quantidade != null ? parseFloat(String(item.quantidade)) : undefined;
      const subtotal = preco != null && qtd != null ? preco * qtd : null;

      await prisma.cotacaoFornecedorItem.update({
        where: { id: item.id },
        data: {
          ...(preco !== undefined ? { precoUnitario: preco } : {}),
          ...(qtd !== undefined ? { quantidade: qtd } : {}),
          ...(item.disponivel !== undefined ? { disponivel: item.disponivel } : {}),
          subtotal: item.disponivel !== false ? subtotal : 0,
        },
      });
    }
  }

  // Recalculate totalCalculado for this supplier
  const allItems = await prisma.cotacaoFornecedorItem.findMany({
    where: { cotacaoFornecedorId: params.fornId },
  });
  const total = allItems.reduce((sum, i) => sum + (i.disponivel ? parseFloat(String(i.subtotal ?? 0)) : 0), 0);
  updateData.totalCalculado = total;

  await prisma.cotacaoFornecedor.update({
    where: { id: params.fornId },
    data: updateData,
  });

  // Recalculate melhorOpcao: supplier with lowest totalCalculado among RESPONDIDA ones
  const allSuppliers = await prisma.cotacaoFornecedor.findMany({
    where: { cotacaoId: params.id },
    select: { id: true, totalCalculado: true, status: true },
  });

  const respondidas = allSuppliers.filter((s) => s.status === "RESPONDIDA" && s.totalCalculado != null);
  if (respondidas.length > 0) {
    respondidas.sort((a, b) => parseFloat(String(a.totalCalculado)) - parseFloat(String(b.totalCalculado)));
    const bestId = respondidas[0].id;

    await prisma.cotacaoFornecedor.updateMany({
      where: { cotacaoId: params.id },
      data: { melhorOpcao: false },
    });
    await prisma.cotacaoFornecedor.update({
      where: { id: bestId },
      data: { melhorOpcao: true },
    });
  }

  const updated = await prisma.cotacaoFornecedor.findUnique({
    where: { id: params.fornId },
    include: {
      fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      itens: {
        include: { item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } } },
      },
    },
  });

  return NextResponse.json({ data: updated });
}
