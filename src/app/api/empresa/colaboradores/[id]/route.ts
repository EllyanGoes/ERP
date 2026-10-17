export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { aprovadorExclusaoColaborador, executarExclusaoColaborador, avisarAprovadorExclusao, ENTIDADE_COLABORADOR } from "@/lib/exclusao-colaborador";
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

// Exclusão sob aprovação (ver lib/exclusao-colaborador): o aprovador exclui
// direto (fica registrada como aprovada, com snapshot); os demais só solicitam.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;
  const { session } = auth;

  try {
    const body = await req.json().catch(() => ({}));
    const motivo = typeof body?.motivo === "string" && body.motivo.trim() ? body.motivo.trim() : null;
    const colab = await prismaSemEscopo.colaborador.findUnique({ where: { id: params.id }, select: { id: true, nome: true } });
    if (!colab) return NextResponse.json({ error: "Colaborador não encontrado" }, { status: 404 });

    const aprovadorId = await aprovadorExclusaoColaborador();
    if (!aprovadorId) return NextResponse.json({ error: "Nenhum aprovador de exclusão configurado (Configurações → Aprovações)." }, { status: 409 });

    if (aprovadorId === session.sub) {
      const r = await executarExclusaoColaborador(params.id);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
      await prismaSemEscopo.solicitacaoExclusao.create({ data: {
        entidade: ENTIDADE_COLABORADOR, registroId: params.id, descricao: colab.nome, motivo, status: "APROVADO",
        solicitadoPor: session.sub, solicitadoPorNome: session.nome, aprovadorId, respondidoEm: new Date(),
        observacao: "Excluído diretamente pelo aprovador", snapshot: r.snapshot as Prisma.InputJsonValue,
      } });
      return NextResponse.json({ ok: true });
    }

    const jaPendente = await prismaSemEscopo.solicitacaoExclusao.findFirst({ where: { entidade: ENTIDADE_COLABORADOR, registroId: params.id, status: "PENDENTE" }, select: { id: true } });
    if (jaPendente) return NextResponse.json({ pendente: true, jaSolicitada: true }, { status: 202 });
    await prismaSemEscopo.solicitacaoExclusao.create({ data: {
      entidade: ENTIDADE_COLABORADOR, registroId: params.id, descricao: colab.nome, motivo,
      solicitadoPor: session.sub, solicitadoPorNome: session.nome, aprovadorId,
    } });
    await avisarAprovadorExclusao(aprovadorId, colab.nome, session.nome, motivo);
    return NextResponse.json({ pendente: true }, { status: 202 });
  } catch (err: unknown) {
    console.error("[DELETE /api/empresa/colaboradores/[id]]", err);
    return NextResponse.json({ error: "Erro ao excluir colaborador" }, { status: 500 });
  }
}
