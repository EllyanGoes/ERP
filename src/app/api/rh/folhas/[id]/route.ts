export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// GET /api/rh/folhas/[id] — detalhe (folha + itens + colaboradores p/ vincular).
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;
  const folha = await prisma.folhaPagamento.findUnique({
    where: { id: params.id },
    include: {
      itens: { orderBy: { nome: "asc" }, include: { colaborador: { select: { id: true, nome: true } } } },
    },
  });
  if (!folha) return NextResponse.json({ error: "Folha não encontrada" }, { status: 404 });
  const colaboradores = await prisma.colaborador.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, classificacaoCusto: true },
  });
  return NextResponse.json({ data: folha, colaboradores });
}

// PATCH /api/rh/folhas/[id] — atualiza vínculo/classificação/valores dos itens
// (revisão antes do fechamento) e/ou datas da folha.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;
  const folha = await prisma.folhaPagamento.findUnique({ where: { id: params.id }, select: { status: true } });
  if (!folha) return NextResponse.json({ error: "Folha não encontrada" }, { status: 404 });
  if (folha.status === "FECHADA") return NextResponse.json({ error: "Folha já fechada" }, { status: 422 });

  const body = await req.json();
  const itens = Array.isArray(body.itens) ? body.itens : [];

  await prisma.$transaction(async (tx) => {
    for (const it of itens) {
      if (!it.id) continue;
      await tx.folhaItem.update({
        where: { id: it.id },
        data: {
          ...(it.colaboradorId !== undefined ? { colaboradorId: it.colaboradorId || null } : {}),
          ...(it.classificacao ? { classificacao: it.classificacao } : {}),
        },
      });
    }
    if (body.dataVencimento !== undefined || body.dataPagamento !== undefined) {
      await tx.folhaPagamento.update({
        where: { id: params.id },
        data: {
          ...(body.dataVencimento !== undefined ? { dataVencimento: body.dataVencimento ? new Date(body.dataVencimento) : null } : {}),
          ...(body.dataPagamento !== undefined ? { dataPagamento: body.dataPagamento ? new Date(body.dataPagamento) : null } : {}),
        },
      });
    }
  });
  return NextResponse.json({ ok: true });
}

// DELETE /api/rh/folhas/[id] — só EM_REVISAO (não fechada).
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;
  const folha = await prisma.folhaPagamento.findUnique({ where: { id: params.id }, select: { status: true } });
  if (!folha) return NextResponse.json({ error: "Folha não encontrada" }, { status: 404 });
  if (folha.status === "FECHADA") return NextResponse.json({ error: "Folha fechada não pode ser excluída" }, { status: 422 });
  await prisma.folhaPagamento.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
