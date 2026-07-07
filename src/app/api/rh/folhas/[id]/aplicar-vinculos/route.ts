export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// POST /api/rh/folhas/[id]/aplicar-vinculos — usa esta folha como PARÂMETRO:
// 1) grava no cadastro dos colaboradores vinculados a matrícula e a classificação
//    de custo (MOD/MOI/ADMIN) que valem nesta folha (fonte da verdade);
// 2) propaga vínculo + classificação para os itens das DEMAIS folhas EM_REVISAO
//    da empresa, casando por matrícula e, na falta dela, por nome.
// Folhas fechadas não são tocadas (a apropriação contábil já foi gerada).
export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;

  const ref = await prisma.folhaPagamento.findUnique({
    where: { id: params.id },
    select: {
      id: true, empresaId: true,
      itens: {
        where: { colaboradorId: { not: null } },
        select: { colaboradorId: true, matricula: true, nome: true, classificacao: true },
      },
    },
  });
  if (!ref) return NextResponse.json({ error: "Folha não encontrada" }, { status: 404 });
  if (!ref.itens.length) {
    return NextResponse.json({ error: "A folha de referência não tem itens vinculados a colaboradores." }, { status: 422 });
  }

  type Ref = { colaboradorId: string; classificacao: "MOD" | "MOI" | "ADMIN" };
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const porMatricula = new Map<string, Ref>();
  const porNome = new Map<string, Ref>();
  const porColaborador = new Map<string, Ref>();
  for (const it of ref.itens) {
    const r: Ref = { colaboradorId: it.colaboradorId!, classificacao: it.classificacao };
    if (it.matricula?.trim()) porMatricula.set(it.matricula.trim(), r);
    porNome.set(norm(it.nome), r);
    porColaborador.set(it.colaboradorId!, r);
  }

  const outras = await prisma.folhaPagamento.findMany({
    where: { empresaId: ref.empresaId, status: "EM_REVISAO", id: { not: ref.id } },
    select: {
      id: true,
      itens: { select: { id: true, colaboradorId: true, matricula: true, nome: true, classificacao: true } },
    },
  });

  let colaboradoresAtualizados = 0, vinculados = 0, reclassificados = 0;
  await prisma.$transaction(async (tx) => {
    for (const it of ref.itens) {
      await tx.colaborador.update({
        where: { id: it.colaboradorId! },
        data: {
          ...(it.matricula?.trim() ? { matricula: it.matricula.trim() } : {}),
          classificacaoCusto: it.classificacao,
        },
      });
      colaboradoresAtualizados++;
    }

    for (const f of outras) {
      for (const it of f.itens) {
        // Item já vinculado só alinha a classificação pelo PRÓPRIO colaborador
        // (casar por matrícula/nome aqui poderia apontar para outra pessoa).
        const r = it.colaboradorId
          ? porColaborador.get(it.colaboradorId)
          : (it.matricula?.trim() ? porMatricula.get(it.matricula.trim()) : null) ?? porNome.get(norm(it.nome));
        if (!r) continue;
        const setVinculo = !it.colaboradorId;
        const setClassif = it.classificacao !== r.classificacao;
        if (!setVinculo && !setClassif) continue;
        await tx.folhaItem.update({
          where: { id: it.id },
          data: {
            ...(setVinculo ? { colaboradorId: r.colaboradorId } : {}),
            ...(setClassif ? { classificacao: r.classificacao } : {}),
          },
        });
        if (setVinculo) vinculados++;
        if (setClassif) reclassificados++;
      }
    }
  });

  return NextResponse.json({
    ok: true,
    data: { colaboradoresAtualizados, folhas: outras.length, vinculados, reclassificados },
  });
}
