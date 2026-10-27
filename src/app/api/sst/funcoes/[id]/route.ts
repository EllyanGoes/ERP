export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { cargoDe, gravarRequisitos, nomeFuncao, sincronizarColaboradores } from "@/lib/sst-funcao";

const INCLUDE = {
  requisitosEpi: { include: { epi: { select: { id: true, nome: true, ca: true } } } },
  requisitosExame: { include: { exameTipo: { select: { id: true, nome: true } } } },
  requisitosTreinamento: { include: { treinamentoTipo: { select: { id: true, nome: true, validadeMeses: true } } } },
  _count: { select: { colaboradores: { where: { fim: null, colaborador: { ativo: true } } } } },
  colaboradores: { where: { fim: null }, select: { colaborador: { select: { id: true, nome: true, ativo: true } } } },
};

// PATCH /api/sst/funcoes/[id] — dados + requisitos (substituição completa quando enviados).
// { cargo?, ghe?, cbo?, grauRisco?, ativo?, epis?, exames?, treinamentos?, colaboradores?: [ids], aplicarNoGhe? }
// aplicarNoGhe: os requisitos enviados valem também p/ as demais funções do mesmo GHE.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const atual = await prisma.sstFuncao.findUnique({ where: { id: params.id }, select: { id: true, nome: true, ghe: true, empresaId: true } });
  if (!atual) return NextResponse.json({ error: "Função não encontrada" }, { status: 404 });
  const data: Record<string, unknown> = {};
  // Nome composto "cargo — GHE": aceita cargo/ghe separados (ou nome legado).
  if (b.cargo !== undefined || b.ghe !== undefined || b.nome !== undefined) {
    const cargo = String(b.cargo ?? (b.nome !== undefined ? cargoDe(String(b.nome)) : cargoDe(atual.nome))).trim();
    if (!cargo) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
    const ghe = b.ghe !== undefined ? (String(b.ghe ?? "").trim() || null) : atual.ghe;
    data.nome = nomeFuncao(cargo, ghe); data.ghe = ghe;
  }
  if (b.cbo !== undefined) data.cbo = b.cbo?.trim() || null;
  if (b.grauRisco !== undefined) data.grauRisco = b.grauRisco ? Number(b.grauRisco) : null;
  if (b.ativo !== undefined) data.ativo = !!b.ativo;
  try {
    const { funcao, aplicadas } = await prismaSemEscopo.$transaction(async (tx) => {
      await gravarRequisitos(tx, params.id, b);
      // colaboradores: [ids] — quem fica vinculado a esta função (4ª coluna do cadastro).
      if (Array.isArray(b.colaboradores)) await sincronizarColaboradores(tx, params.id, b.colaboradores as string[]);
      const funcao = await tx.sstFuncao.update({ where: { id: params.id }, data, include: INCLUDE });
      let aplicadas = 0;
      if (b.aplicarNoGhe && funcao.ghe) {
        const irmas = await tx.sstFuncao.findMany({ where: { empresaId: atual.empresaId, ghe: funcao.ghe, id: { not: funcao.id } }, select: { id: true } });
        for (const f of irmas) await gravarRequisitos(tx, f.id, b);
        aplicadas = irmas.length;
      }
      return { funcao, aplicadas };
    });
    return NextResponse.json({ data: funcao, aplicadas });
  } catch (e) {
    const msg = e instanceof Error && e.message.includes("Unique") ? "Já existe uma função com esse nome nesta empresa." : "Erro ao salvar a função";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
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
