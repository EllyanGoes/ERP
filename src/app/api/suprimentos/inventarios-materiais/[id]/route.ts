export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { recalcularSaldos } from "@/lib/estoque-saldos";
import { aplicarAjustesInventario, type ItemAjusteInventario } from "@/lib/inventario-ajuste";
import { contabilizarInventario, apagarLancamentosContabeis } from "@/lib/contabilidade";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("almoxarifado");
  if (!auth.ok) return auth.response;

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
      await aplicarAjustesInventario(tx, updated, body.itens as ItemAjusteInventario[]);
    }

    return updated;
  });

  // Contabiliza o ajuste de inventário (sobra/perda) ao concluir. Best-effort.
  if (body.status === "CONCLUIDO") {
    await contabilizarInventario(params.id).catch(() => {});
  }

  return NextResponse.json({ data: record });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("almoxarifado");
  if (!auth.ok) return auth.response;

  const inv = await prisma.inventarioMaterial.findUnique({
    where: { id: params.id },
    select: { numero: true, empresaId: true, status: true },
  });
  if (!inv) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (inv.status === "CONCLUIDO" && auth.session.perfil !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores podem excluir inventários concluídos" }, { status: 403 });
  }

  // Excluir um inventário tem de DESFAZER o ajuste que ele aplicou: reverte o
  // saldo pelo delta (saldoDepois − saldoAntes), apaga os movimentos AJUSTE e o
  // lançamento contábil (sobra/perda) — senão estoque e razão ficam alterados.
  await prisma.$transaction(async (tx) => {
    const movs = await tx.movimentacaoEstoque.findMany({
      where: { empresaId: inv.empresaId, documento: inv.numero, tipo: "AJUSTE" },
      select: { id: true, itemId: true, localEstoqueId: true, saldoAntes: true, saldoDepois: true, clienteDonoId: true },
    });
    const afetados = new Set<string>();
    for (const m of movs) {
      const delta = parseFloat(String(m.saldoDepois)) - parseFloat(String(m.saldoAntes));
      if (m.localEstoqueId && delta !== 0) {
        await tx.estoqueItem.updateMany({
          where: { itemId: m.itemId, localEstoqueId: m.localEstoqueId, clienteDonoId: m.clienteDonoId ?? null },
          data: { quantidadeAtual: { decrement: delta } },
        });
        afetados.add(`${m.itemId}|${m.localEstoqueId}|${m.clienteDonoId ?? ""}`);
      }
    }
    if (movs.length) await tx.movimentacaoEstoque.deleteMany({ where: { id: { in: movs.map((m) => m.id) } } });
    for (const chave of Array.from(afetados)) {
      const [itemId, localId, dono] = chave.split("|");
      await recalcularSaldos(tx, itemId, localId, dono || null);
    }
    await tx.inventarioMaterial.delete({ where: { id: params.id } });

    // Contábil (sobra/perda) DENTRO da transação (atômico): se falhar, a exclusão
    // inteira faz rollback e não sobra lançamento órfão no razão.
    await apagarLancamentosContabeis({ empresaId: inv.empresaId, origemTipo: "ESTOQUE_AJUSTE", origemId: params.id }, tx);
  });

  return NextResponse.json({ ok: true });
}
