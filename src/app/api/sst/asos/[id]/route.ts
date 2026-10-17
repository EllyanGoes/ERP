export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { salvarNaLixeira } from "@/lib/lixeira";
import { somaMeses } from "@/lib/sst";

// PATCH /api/sst/asos/:id { tipo?, data?, validade?, resultado?, restricoes?, medicoId? | (medico?, crm?), documentoId?, exames?: [exameTipoId] }
// `exames` sincroniza os exames LIGADOS a este ASO: cria os marcados que faltam e
// remove os desmarcados. Mudou a data do ASO: os exames ligados com a data antiga
// acompanham. Validade vazia recalcula pela função (como no lançamento).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const aso = await prisma.sstAso.findUnique({ where: { id: params.id }, include: { exames: { select: { id: true, exameTipoId: true, data: true } } } });
  if (!aso) return NextResponse.json({ error: "ASO não encontrado" }, { status: 404 });

  const tipo = ["ADMISSIONAL", "PERIODICO", "MUDANCA_FUNCAO", "MUDANCA_RISCO", "RETORNO", "DEMISSIONAL"].includes(b.tipo) ? b.tipo : aso.tipo;
  const resultado = ["APTO", "INAPTO", "APTO_RESTRICOES"].includes(b.resultado) ? b.resultado : aso.resultado;
  const data = b.data ? new Date(b.data) : aso.data;
  let validade: Date | null = b.validade === undefined ? aso.validade : b.validade ? new Date(b.validade) : null;
  if (b.validade !== undefined && !validade && tipo !== "DEMISSIONAL") {
    const vinculo = await prismaSemEscopo.sstColaboradorFuncao.findFirst({
      where: { colaboradorId: aso.colaboradorId, fim: null },
      select: { funcao: { select: { requisitosExame: { select: { periodicidadeMeses: true } } } } },
    });
    const periodos = vinculo?.funcao.requisitosExame.map((r) => r.periodicidadeMeses) ?? [];
    validade = somaMeses(data, periodos.length ? Math.min(...periodos) : 12);
  }
  const med = b.medicoId ? await prisma.sstMedico.findUnique({ where: { id: String(b.medicoId) }, select: { id: true, nome: true, crm: true, uf: true } }) : null;
  const medico = b.medicoId !== undefined || b.medico !== undefined
    ? { medicoId: med?.id ?? null, medico: med ? med.nome : b.medico?.trim() || null, crm: med ? (med.uf ? `${med.crm}/${med.uf}` : med.crm) : b.crm?.trim() || null }
    : {};
  const marcados: string[] | null = Array.isArray(b.exames) ? b.exames.filter((x: unknown) => typeof x === "string") : null;

  await prismaSemEscopo.$transaction(async (tx) => {
    await tx.sstAso.update({
      where: { id: aso.id },
      data: { tipo, data, validade, resultado, ...medico,
        ...(b.restricoes !== undefined ? { restricoes: b.restricoes?.trim() || null } : {}),
        ...(b.documentoId !== undefined ? { documentoId: b.documentoId || null } : {}) },
    });
    if (data.getTime() !== aso.data.getTime()) {
      await tx.sstExame.updateMany({ where: { asoId: aso.id, data: aso.data }, data: { data } });
    }
    if (marcados) {
      const sair = aso.exames.filter((e) => !marcados.includes(e.exameTipoId)).map((e) => e.id);
      if (sair.length) await tx.sstExame.deleteMany({ where: { id: { in: sair } } });
      const novos = marcados.filter((t) => !aso.exames.some((e) => e.exameTipoId === t));
      if (novos.length) await tx.sstExame.createMany({ data: novos.map((exameTipoId) => ({ empresaId: aso.empresaId, colaboradorId: aso.colaboradorId, exameTipoId, data, asoId: aso.id, criadoPor: auth.session.nome })) });
    }
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const aso = await prisma.sstAso.findUnique({ where: { id: params.id }, include: { exames: true, colaborador: { select: { nome: true } } } });
  if (!aso) return NextResponse.json({ error: "ASO não encontrado" }, { status: 404 });
  await prismaSemEscopo.$transaction(async (tx) => {
    await salvarNaLixeira(tx, { empresaId: aso.empresaId, tipo: "SST_REGISTRO", origemId: aso.id, numero: null, descricao: `ASO ${aso.tipo} — ${aso.colaborador.nome}`, snapshot: aso, apagadoPor: auth.session.nome });
    await tx.sstAso.delete({ where: { id: params.id } });
  });
  return NextResponse.json({ ok: true });
}
