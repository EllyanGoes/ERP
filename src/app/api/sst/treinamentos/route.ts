export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { somaMeses } from "@/lib/sst";
import { salvarNaLixeira } from "@/lib/lixeira";

const INCLUDE = {
  tipo: { select: { id: true, nome: true, norma: true, validadeMeses: true } },
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
      tipoId: tipo.id, data, instrutor: b.instrutor?.trim() || null, entidade: b.entidade?.trim() || null,
      cargaHoraria: b.cargaHoraria ? Number(b.cargaHoraria) : tipo.cargaHoraria, listaPresencaDocumentoId: b.listaPresencaDocumentoId || null, observacoes: b.observacoes?.trim() || null,
      participantes: { create: parts.map((p) => ({ colaboradorId: p.colaboradorId, aprovado: p.aprovado !== false, validade, certificadoDocumentoId: p.certificadoDocumentoId || null })) },
    },
    include: INCLUDE,
  });
  return NextResponse.json({ data: t }, { status: 201 });
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
