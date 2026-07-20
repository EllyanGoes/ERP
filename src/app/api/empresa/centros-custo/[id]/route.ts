export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  codigo:             z.string().min(1).optional(),
  nome:               z.string().min(1).optional(),
  grupoCentroCustoId: z.string().nullable().optional(),
  ativo:              z.boolean().optional(),
  fabril:             z.boolean().optional(),
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const record = await prisma.centroCusto.findUnique({
    where: { id: params.id },
    include: { grupoCentroCusto: { select: { id: true, nome: true } } },
  });
  if (!record) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(record);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  try {
    // Fabril é HERDADO do grupo (fonte da verdade). Resolve o grupo final
    // (o novo do body, senão o atual) e sincroniza a coluna do centro.
    const atual = await prisma.centroCusto.findUnique({
      where: { id: params.id }, select: { grupoCentroCustoId: true },
    });
    if (!atual) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    const grupoFinalId = body.data.grupoCentroCustoId !== undefined
      ? body.data.grupoCentroCustoId
      : atual.grupoCentroCustoId;
    const grupo = grupoFinalId
      ? await prisma.grupoCentroCusto.findUnique({ where: { id: grupoFinalId }, select: { fabril: true } })
      : null;
    const record = await prisma.centroCusto.update({
      where: { id: params.id },
      data: { ...body.data, ...(grupo ? { fabril: grupo.fabril } : {}) },
      include: { grupoCentroCusto: { select: { id: true, nome: true, fabril: true } } },
    });
    return NextResponse.json(record);
  } catch {
    return NextResponse.json({ error: "Código já cadastrado por outro centro de custo" }, { status: 409 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  // Centro com MOVIMENTO nunca é excluído fisicamente (histórico ficaria órfão):
  // vira inativo (padrão das naturezas). Sem movimento → delete de verdade.
  const usos = await prisma.centroCusto.findUnique({
    where: { id: params.id },
    select: {
      _count: {
        select: {
          contasPagar: true, contasReceber: true, lancamentosFinanceiros: true,
          recorrencias: true, requisicoesCompra: true, itensRequisicao: true,
          necessidadesCompra: true, itensPedidoCompra: true, itensConferencia: true,
        },
      },
    },
  });
  if (!usos) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const total = Object.values(usos._count).reduce((s, n) => s + n, 0);
  if (total > 0) {
    await prisma.centroCusto.update({ where: { id: params.id }, data: { ativo: false } });
    return NextResponse.json({ ok: true, inativado: true });
  }
  await prisma.centroCusto.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
