export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const include = {
  filiais: true,
  usuario: { select: { id: true, nome: true, email: true } },
} as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const colaborador = await prisma.colaborador.findUnique({
    where: { id: params.id },
    include: {
      ...include,
      etapasAprovacao: {
        include: { fluxo: { select: { id: true, nome: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!colaborador) {
    return NextResponse.json({ error: "Colaborador não encontrado" }, { status: 404 });
  }

  return NextResponse.json(colaborador);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { dataAdmissao, dataDemissao, filialIds, ...rest } = body;

    const data: Record<string, unknown> = { ...rest };
    if (dataAdmissao !== undefined) data.dataAdmissao = dataAdmissao ? new Date(dataAdmissao) : null;
    if (dataDemissao !== undefined) data.dataDemissao = dataDemissao ? new Date(dataDemissao) : null;
    if (rest.cpf !== undefined) data.cpf = rest.cpf?.trim() || null;
    if (filialIds !== undefined) data.filiais = { set: (filialIds as string[]).map((id: string) => ({ id })) };

    const colaborador = await prisma.colaborador.update({
      where: { id: params.id },
      data,
      include,
    });

    return NextResponse.json(colaborador);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "CPF já cadastrado" }, { status: 409 });
    }
    if (e?.code === "P2025") {
      return NextResponse.json({ error: "Colaborador não encontrado" }, { status: 404 });
    }
    console.error("[PATCH /api/empresa/colaboradores/[id]]", err);
    return NextResponse.json({ error: "Erro ao atualizar colaborador" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check for pending approvals
    const pendingCount = await prisma.aprovacaoSC.count({
      where: {
        aprovadorId: params.id,
        status: "PENDENTE",
      },
    });

    if (pendingCount > 0) {
      return NextResponse.json(
        { error: `Colaborador possui ${pendingCount} aprovação(ões) pendente(s)` },
        { status: 409 }
      );
    }

    await prisma.colaborador.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2025") {
      return NextResponse.json({ error: "Colaborador não encontrado" }, { status: 404 });
    }
    console.error("[DELETE /api/empresa/colaboradores/[id]]", err);
    return NextResponse.json({ error: "Erro ao excluir colaborador" }, { status: 500 });
  }
}
