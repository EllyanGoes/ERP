export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sincronizarContasColaborador } from "@/lib/conta-contabil";

const include = {
  filiais: true,
  empresas: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
  usuario: { select: { id: true, nome: true, email: true } },
  setor:   { select: { id: true, nome: true } },
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
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { dataAdmissao, dataDemissao, filialIds, empresaIds, ...rest } = body;

    const data: Record<string, unknown> = { ...rest };
    if (dataAdmissao !== undefined) data.dataAdmissao = dataAdmissao ? new Date(dataAdmissao) : null;
    if (dataDemissao !== undefined) data.dataDemissao = dataDemissao ? new Date(dataDemissao) : null;
    if (rest.cpf !== undefined) data.cpf = rest.cpf?.trim() || null;
    if (filialIds !== undefined) data.filiais = { set: (filialIds as string[]).map((id: string) => ({ id })) };
    if (empresaIds !== undefined) data.empresas = { set: (empresaIds as string[]).map((id: string) => ({ id })) };

    const colaborador = await prisma.colaborador.update({
      where: { id: params.id },
      data,
      include,
    });

    // Garante a conta contábil do colaborador nas empresas onde está presente.
    if (Array.isArray(empresaIds) && empresaIds.length) await sincronizarContasColaborador(colaborador.id, empresaIds).catch(() => {});

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
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

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
