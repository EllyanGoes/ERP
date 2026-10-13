export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";

const INCLUDE = {
  requisitosEpi: { include: { epi: { select: { id: true, nome: true, ca: true } } } },
  requisitosExame: { include: { exameTipo: { select: { id: true, nome: true } } } },
  requisitosTreinamento: { include: { treinamentoTipo: { select: { id: true, nome: true, validadeMeses: true } } } },
  _count: { select: { colaboradores: { where: { fim: null } } } },
};

// PATCH /api/sst/funcoes/[id] — dados + requisitos (substituição completa quando enviados).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const atual = await prisma.sstFuncao.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!atual) return NextResponse.json({ error: "Função não encontrada" }, { status: 404 });
  const data: Record<string, unknown> = {};
  if (b.nome !== undefined) { const n = String(b.nome).trim(); if (!n) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 }); data.nome = n; }
  if (b.cbo !== undefined) data.cbo = b.cbo?.trim() || null;
  if (b.grauRisco !== undefined) data.grauRisco = b.grauRisco ? Number(b.grauRisco) : null;
  if (b.ativo !== undefined) data.ativo = !!b.ativo;
  const funcao = await prismaSemEscopo.$transaction(async (tx) => {
    if (Array.isArray(b.epis)) {
      await tx.sstFuncaoEpi.deleteMany({ where: { funcaoId: params.id } });
      await tx.sstFuncaoEpi.createMany({
        data: (b.epis as { epiId: string; obrigatorio?: boolean; quantidade?: number }[]).filter((e) => e?.epiId)
          .map((e) => ({ funcaoId: params.id, epiId: e.epiId, obrigatorio: e.obrigatorio !== false, quantidade: Math.max(1, Number(e.quantidade) || 1) })),
        skipDuplicates: true,
      });
    }
    if (Array.isArray(b.exames)) {
      await tx.sstFuncaoExame.deleteMany({ where: { funcaoId: params.id } });
      await tx.sstFuncaoExame.createMany({
        data: (b.exames as { exameTipoId: string; periodicidadeMeses: number }[]).filter((e) => e?.exameTipoId && Number(e.periodicidadeMeses) > 0)
          .map((e) => ({ funcaoId: params.id, exameTipoId: e.exameTipoId, periodicidadeMeses: Number(e.periodicidadeMeses) })),
        skipDuplicates: true,
      });
    }
    if (Array.isArray(b.treinamentos)) {
      await tx.sstFuncaoTreinamento.deleteMany({ where: { funcaoId: params.id } });
      await tx.sstFuncaoTreinamento.createMany({
        data: (b.treinamentos as { treinamentoTipoId: string }[]).filter((t) => t?.treinamentoTipoId).map((t) => ({ funcaoId: params.id, treinamentoTipoId: t.treinamentoTipoId })),
        skipDuplicates: true,
      });
    }
    return tx.sstFuncao.update({ where: { id: params.id }, data, include: INCLUDE });
  });
  return NextResponse.json({ data: funcao });
}

// DELETE — só sem colaboradores vinculados (histórico incluso); senão, inative.
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const n = await prismaSemEscopo.sstColaboradorFuncao.count({ where: { funcaoId: params.id } });
  if (n > 0) return NextResponse.json({ error: `A função tem ${n} vínculo(s) de colaborador. Inative em vez de excluir.` }, { status: 400 });
  await prisma.sstFuncao.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
