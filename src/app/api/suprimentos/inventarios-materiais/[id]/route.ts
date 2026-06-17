export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { definirCustoEmpresa } from "@/lib/custo-empresa";
import { recalcularSaldos } from "@/lib/estoque-saldos";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const record = await prisma.inventarioMaterial.findUnique({
    where: { id: params.id },
    include: {
      localEstoque: { select: { id: true, nome: true } },
      colaborador:  { select: { id: true, nome: true } },
      itens: {
        include: {
          item:      { select: { id: true, codigo: true, descricao: true, unidadeMedida: true, precoCusto: true, unidade: { select: { sigla: true } } } },
          fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        },
        orderBy: { item: { descricao: "asc" } },
      },
    },
  });
  if (!record) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json({ data: record });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("almoxarifado");
  if (!auth.ok) return auth.response;

  const body = await req.json();

  const record = await prisma.$transaction(async (tx) => {
    const updateData: Record<string, unknown> = {};

    if (body.status        !== undefined) updateData.status        = body.status;
    if (body.colaboradorId !== undefined) updateData.colaboradorId = body.colaboradorId || null;
    if (body.data          !== undefined) updateData.data          = body.data ? new Date(body.data) : null;
    if (body.tipo          !== undefined) updateData.tipo          = body.tipo;
    if (body.observacoes   !== undefined) updateData.observacoes   = body.observacoes?.trim() || null;

    if (Array.isArray(body.itens)) {
      await tx.inventarioMaterialItem.deleteMany({ where: { inventarioId: params.id } });
      updateData.itens = {
        create: body.itens.map((it: {
          itemId: string; localizacao?: string;
          saldoSistema: number; saldoFisico?: number; diferenca?: number;
          custoUnitario?: number; fornecedorId?: string;
        }) => ({
          itemId:        it.itemId,
          localizacao:   it.localizacao?.trim() || null,
          saldoSistema:  parseFloat(String(it.saldoSistema)),
          saldoFisico:   it.saldoFisico   != null ? parseFloat(String(it.saldoFisico))   : null,
          diferenca:     it.diferenca     != null ? parseFloat(String(it.diferenca))     : null,
          custoUnitario: it.custoUnitario != null ? parseFloat(String(it.custoUnitario)) : null,
          fornecedorId:  it.fornecedorId  || null,
        })),
      };
    }

    const updated = await tx.inventarioMaterial.update({
      where: { id: params.id },
      data: updateData,
      include: {
        localEstoque: { select: { id: true, nome: true } },
        colaborador:  { select: { id: true, nome: true } },
        itens: {
          include: {
            item:      { select: { id: true, codigo: true, descricao: true, unidadeMedida: true, precoCusto: true, unidade: { select: { sigla: true } } } },
            fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
          },
        },
      },
    });

    // Ao CONCLUIR: (a) atualiza custo dos itens com custoUnitario; (b) ajusta o
    // saldo de estoque à contagem física (saldoFisico), gerando movimentação de
    // AJUSTE. Sem isto o inventário não corrigia o saldo — só mexia no custo.
    if (body.status === "CONCLUIDO" && Array.isArray(body.itens)) {
      const localEstoqueId = updated.localEstoqueId;
      const r3 = (x: number) => Math.round(x * 1000) / 1000; // saldos Decimal(15,3)
      const afetados = new Set<string>();

      for (const it of body.itens as { itemId: string; custoUnitario?: number; saldoFisico?: number | string | null }[]) {
        if (it.custoUnitario != null && it.custoUnitario > 0) {
          await tx.item.update({
            where: { id: it.itemId },
            data:  { precoCusto: parseFloat(String(it.custoUnitario)) },
          });
          // Custo próprio da empresa dona do inventário (custo por empresa).
          await definirCustoEmpresa(tx, updated.empresaId, it.itemId, parseFloat(String(it.custoUnitario)));
        }

        // Ajuste de saldo: leva o estoque PRÓPRIO (clienteDonoId null) do item,
        // neste local, à contagem física. Só lança se houver diferença.
        if (it.saldoFisico != null && it.saldoFisico !== "") {
          const saldoFisico = r3(parseFloat(String(it.saldoFisico)));
          const estoque = await tx.estoqueItem.findFirst({
            where: { itemId: it.itemId, localEstoqueId, clienteDonoId: null },
            select: { id: true, quantidadeAtual: true },
          });
          const saldoAntes = estoque ? parseFloat(String(estoque.quantidadeAtual)) : 0;
          const diff = r3(saldoFisico - saldoAntes);
          if (diff !== 0) {
            if (estoque) {
              await tx.estoqueItem.update({ where: { id: estoque.id }, data: { quantidadeAtual: saldoFisico } });
            } else {
              await tx.estoqueItem.create({
                data: {
                  empresaId: updated.empresaId,
                  itemId: it.itemId,
                  localEstoqueId,
                  quantidadeAtual: saldoFisico,
                  quantidadeMin: 0,
                  clienteDonoId: null,
                },
              });
            }
            await tx.movimentacaoEstoque.create({
              data: {
                empresaId: updated.empresaId,
                itemId: it.itemId,
                localEstoqueId,
                tipo: "AJUSTE",
                quantidade: Math.abs(diff),
                saldoAntes,
                saldoDepois: saldoFisico,
                documento: updated.numero,
                observacoes: `Ajuste por inventário ${updated.numero}`,
                clienteDonoId: null,
              },
            });
            afetados.add(it.itemId);
          }
        }
      }

      // Normaliza a cadeia de saldos corridos de cada item ajustado.
      for (const itemId of Array.from(afetados)) {
        await recalcularSaldos(tx, itemId, localEstoqueId, null);
      }
    }

    return updated;
  });

  return NextResponse.json({ data: record });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("almoxarifado");
  if (!auth.ok) return auth.response;

  await prisma.inventarioMaterial.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
