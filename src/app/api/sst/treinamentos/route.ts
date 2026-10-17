export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { somaMeses } from "@/lib/sst";
import { salvarNaLixeira } from "@/lib/lixeira";

const INCLUDE = {
  tipo: { select: { id: true, nome: true, norma: true, validadeMeses: true } },
  instrutorCadastro: { select: { id: true, nome: true, entidade: true } },
  participantes: { include: { colaborador: { select: { id: true, nome: true } } } },
};

// GET /api/sst/treinamentos?colaboradorId=
export async function GET(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const colaboradorId = new URL(req.url).searchParams.get("colaboradorId");
  const data = await prisma.sstTreinamento.findMany({
    where: colaboradorId ? { participantes: { some: { colaboradorId } } } : {},
    orderBy: { data: "desc" }, take: 300, include: INCLUDE,
  });
  return NextResponse.json({ data });
}

// POST { tipoId, data, instrutor?, entidade?, cargaHoraria?, listaPresencaDocumentoId?, observacoes?, participantes: [{colaboradorId, aprovado?, certificadoDocumentoId?}] }
// Validade por participante = data + validadeMeses do tipo (null = não vence).
export async function POST(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  if (!b.tipoId) return NextResponse.json({ error: "Informe o tipo de treinamento." }, { status: 400 });
  const tipo = await prisma.sstTreinamentoTipo.findUnique({ where: { id: b.tipoId }, select: { id: true, validadeMeses: true, cargaHoraria: true } });
  if (!tipo) return NextResponse.json({ error: "Tipo não encontrado" }, { status: 404 });
  const data = b.data ? new Date(b.data) : new Date();
  const parts: { colaboradorId: string; aprovado?: boolean; certificadoDocumentoId?: string | null }[] = Array.isArray(b.participantes) ? b.participantes.filter((p: { colaboradorId?: string }) => p?.colaboradorId) : [];
  if (parts.length === 0) return NextResponse.json({ error: "Informe ao menos um participante." }, { status: 400 });
  const validade = tipo.validadeMeses ? somaMeses(data, tipo.validadeMeses) : null;
  const t = await prisma.sstTreinamento.create({
    data: {
      empresaId: auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID,
      tipoId: tipo.id, data, instrutorId: b.instrutorId || null, instrutor: b.instrutor?.trim() || null, entidade: b.entidade?.trim() || null,
      cargaHoraria: b.cargaHoraria ? Number(b.cargaHoraria) : tipo.cargaHoraria, listaPresencaDocumentoId: b.listaPresencaDocumentoId || null, observacoes: b.observacoes?.trim() || null,
      participantes: { create: parts.map((p) => ({ colaboradorId: p.colaboradorId, aprovado: p.aprovado !== false, validade, certificadoDocumentoId: p.certificadoDocumentoId || null })) },
    },
    include: INCLUDE,
  });
  return NextResponse.json({ data: t }, { status: 201 });
}

// PATCH /api/sst/treinamentos?id= { tipoId?, data?, instrutorId?, instrutor?, entidade?, cargaHoraria?, listaPresencaDocumentoId?, participantes?: [colaboradorId] }
// Participantes: mantém os que continuam (certificado/aprovação preservados),
// cria os novos e remove os desmarcados. Validade recalculada pela data/tipo.
export async function PATCH(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const b = await req.json().catch(() => ({}));
  const t = await prisma.sstTreinamento.findUnique({ where: { id }, include: { participantes: { select: { colaboradorId: true } } } });
  if (!t) return NextResponse.json({ error: "Turma não encontrada" }, { status: 404 });
  const tipo = await prisma.sstTreinamentoTipo.findUnique({ where: { id: b.tipoId || t.tipoId }, select: { id: true, validadeMeses: true } });
  if (!tipo) return NextResponse.json({ error: "Tipo não encontrado" }, { status: 404 });
  const data = b.data ? new Date(b.data) : t.data;
  const validade = tipo.validadeMeses ? somaMeses(data, tipo.validadeMeses) : null;
  const ids: string[] | null = Array.isArray(b.participantes) ? b.participantes.filter((x: unknown) => typeof x === "string") : null;
  if (ids && ids.length === 0) return NextResponse.json({ error: "Informe ao menos um participante." }, { status: 400 });
  await prismaSemEscopo.$transaction(async (tx) => {
    await tx.sstTreinamento.update({
      where: { id },
      data: {
        tipoId: tipo.id, data,
        ...(b.instrutorId !== undefined ? { instrutorId: b.instrutorId || null } : {}),
        ...(b.instrutor !== undefined ? { instrutor: b.instrutor?.trim() || null } : {}),
        ...(b.entidade !== undefined ? { entidade: b.entidade?.trim() || null } : {}),
        ...(b.cargaHoraria !== undefined ? { cargaHoraria: b.cargaHoraria ? Number(b.cargaHoraria) : null } : {}),
        ...(b.listaPresencaDocumentoId !== undefined ? { listaPresencaDocumentoId: b.listaPresencaDocumentoId || null } : {}),
      },
    });
    if (ids) {
      await tx.sstTreinamentoParticipante.deleteMany({ where: { treinamentoId: id, colaboradorId: { notIn: ids } } });
      const novos = ids.filter((c) => !t.participantes.some((p) => p.colaboradorId === c));
      if (novos.length) await tx.sstTreinamentoParticipante.createMany({ data: novos.map((colaboradorId) => ({ treinamentoId: id, colaboradorId, aprovado: true, validade })) });
    }
    await tx.sstTreinamentoParticipante.updateMany({ where: { treinamentoId: id }, data: { validade } });
  });
  return NextResponse.json({ ok: true });
}

// DELETE /api/sst/treinamentos?id=
export async function DELETE(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const t = await prisma.sstTreinamento.findUnique({ where: { id }, include: INCLUDE });
  if (!t) return NextResponse.json({ error: "Turma não encontrada" }, { status: 404 });
  await prismaSemEscopo.$transaction(async (tx) => {
    await salvarNaLixeira(tx, { empresaId: t.empresaId, tipo: "SST_REGISTRO", origemId: t.id, numero: null, descricao: `Treinamento ${t.tipo.nome} — ${t.data.toISOString().slice(0, 10)}`, snapshot: t, apagadoPor: auth.session.nome });
    await tx.sstTreinamento.delete({ where: { id } });
  });
  return NextResponse.json({ ok: true });
}
