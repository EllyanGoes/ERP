export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; fornId: string } }
) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const {
    status, prazoEntregaDias, condicoesPagamento, observacao, itens,
    frete, tipoFrete, desconto, vrDesconto, despesas, seguro,
  } = body;

  const updateData: Record<string, unknown> = {};
  if (status !== undefined) updateData.status = status;
  if (prazoEntregaDias !== undefined) updateData.prazoEntregaDias = prazoEntregaDias ? Number(prazoEntregaDias) : null;
  if (condicoesPagamento !== undefined) updateData.condicoesPagamento = condicoesPagamento || null;
  if (observacao !== undefined) updateData.observacao = observacao || null;
  if (frete !== undefined) updateData.frete = frete != null ? parseFloat(String(frete)) : null;
  if (tipoFrete !== undefined) updateData.tipoFrete = tipoFrete || null;
  if (desconto !== undefined) updateData.desconto = desconto != null ? parseFloat(String(desconto)) : null;
  if (vrDesconto !== undefined) updateData.vrDesconto = vrDesconto != null ? parseFloat(String(vrDesconto)) : null;
  if (despesas !== undefined) updateData.despesas = despesas != null ? parseFloat(String(despesas)) : null;
  if (seguro !== undefined) updateData.seguro = seguro != null ? parseFloat(String(seguro)) : null;

  // Update item prices if provided
  if (itens && Array.isArray(itens)) {
    for (const item of itens) {
      const preco = item.precoUnitario != null ? parseFloat(String(item.precoUnitario)) : null;
      const qtd = item.quantidade != null ? parseFloat(String(item.quantidade)) : undefined;
      const pctDesc = item.desconto != null ? parseFloat(String(item.desconto)) : 0;
      const bruto = preco != null && qtd != null ? preco * qtd : null;
      const subtotal = bruto != null ? bruto * (1 - pctDesc / 100) : null;

      await prisma.cotacaoFornecedorItem.update({
        where: { id: item.id },
        data: {
          ...(preco !== undefined ? { precoUnitario: preco } : {}),
          ...(qtd !== undefined ? { quantidade: qtd } : {}),
          ...(item.disponivel !== undefined ? { disponivel: item.disponivel } : {}),
          ...(item.situacao !== undefined ? { situacao: item.situacao } : {}),
          ...(item.qtdDisponivel != null ? { qtdDisponivel: parseFloat(String(item.qtdDisponivel)) } : {}),
          ...(item.desconto !== undefined ? { desconto: pctDesc || null } : {}),
          subtotal: item.disponivel !== false ? subtotal : 0,
        },
      });
    }
  }

  // Recalculate totalCalculado for this supplier (items subtotal + frete + despesas + seguro - vrDesconto)
  const allItems = await prisma.cotacaoFornecedorItem.findMany({
    where: { cotacaoFornecedorId: params.fornId },
  });
  const itemsSubtotal = allItems.reduce((sum, i) => sum + (i.disponivel ? parseFloat(String(i.subtotal ?? 0)) : 0), 0);
  const freteNum = frete != null ? parseFloat(String(frete)) : 0;
  const despesasNum = despesas != null ? parseFloat(String(despesas)) : 0;
  const seguroNum = seguro != null ? parseFloat(String(seguro)) : 0;
  const vrDescontoNum = vrDesconto != null ? parseFloat(String(vrDesconto)) : 0;
  const total = itemsSubtotal - vrDescontoNum + freteNum + despesasNum + seguroNum;
  updateData.totalCalculado = total;

  // ── Create history snapshot of current state ──────────────────────────
  const currentCf = await prisma.cotacaoFornecedor.findUnique({
    where: { id: params.fornId },
    include: { itens: { include: { item: { select: { codigo: true, descricao: true } } } } },
  });
  if (currentCf) {
    const versaoCount = await prisma.cotacaoFornecedorHistorico.count({
      where: { cotacaoFornecedorId: params.fornId },
    });
    const itensSnapshot = currentCf.itens.map((i) => ({
      codigo: i.item.codigo,
      descricao: i.item.descricao,
      quantidade: String(i.quantidade),
      precoUnitario: i.precoUnitario != null ? String(i.precoUnitario) : null,
      subtotal: i.subtotal != null ? String(i.subtotal) : null,
      situacao: i.situacao,
    }));
    await prisma.cotacaoFornecedorHistorico.create({
      data: {
        cotacaoFornecedorId: params.fornId,
        versao: versaoCount + 1,
        totalCalculado: currentCf.totalCalculado,
        frete: currentCf.frete,
        tipoFrete: currentCf.tipoFrete,
        desconto: currentCf.desconto,
        vrDesconto: currentCf.vrDesconto,
        despesas: currentCf.despesas,
        seguro: currentCf.seguro,
        condicoesPagamento: currentCf.condicoesPagamento,
        prazoEntregaDias: currentCf.prazoEntregaDias,
        observacao: currentCf.observacao,
        itensSnapshot,
      },
    });
  }

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

export async function DELETE(
  _: NextRequest,
  { params }: { params: { id: string; fornId: string } }
) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  await prisma.cotacaoFornecedor.delete({ where: { id: params.fornId } });
  return NextResponse.json({ success: true });
}
