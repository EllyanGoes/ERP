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
  const removidos: string[] = Array.isArray(body.removidos) ? body.removidos : [];
  const numCampos = ["bruto", "liquido", "inssRetido", "inssPatronal", "irrf", "fgts"] as const;
  // pt-BR: vírgula decimal, ponto de milhar opcional; aceita ponto puro também.
  const num = (v: unknown) => {
    const s = String(v ?? "").trim();
    const x = parseFloat(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
    return Number.isFinite(x) ? x : 0;
  };

  await prisma.$transaction(async (tx) => {
    if (removidos.length) await tx.folhaItem.deleteMany({ where: { id: { in: removidos }, folhaId: params.id } });

    for (const it of itens) {
      const valores = Object.fromEntries(numCampos.filter((c) => it[c] !== undefined).map((c) => [c, num(it[c])]));
      if (!it.id) {
        // Linha nova (manual).
        await tx.folhaItem.create({
          data: {
            folhaId: params.id,
            nome: (it.nome || "Colaborador").toString(),
            colaboradorId: it.colaboradorId || null,
            classificacao: it.classificacao || "ADMIN",
            bruto: 0, liquido: 0, inssRetido: 0, inssPatronal: 0, irrf: 0, fgts: 0,
            ...valores,
          },
        });
        continue;
      }
      await tx.folhaItem.update({
        where: { id: it.id },
        data: {
          ...(it.nome !== undefined ? { nome: (it.nome || "Colaborador").toString() } : {}),
          ...(it.colaboradorId !== undefined ? { colaboradorId: it.colaboradorId || null } : {}),
          ...(it.classificacao ? { classificacao: it.classificacao } : {}),
          ...valores,
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

    // Aprende a matrícula: grava no cadastro do colaborador vinculado (se ainda
    // não tiver), p/ casar automaticamente nas próximas competências.
    const vinculados = await tx.folhaItem.findMany({
      where: { folhaId: params.id, colaboradorId: { not: null }, matricula: { not: null } },
      select: { colaboradorId: true, matricula: true },
    });
    for (const v of vinculados) {
      await tx.colaborador.updateMany({
        where: { id: v.colaboradorId!, OR: [{ matricula: null }, { matricula: "" }] },
        data: { matricula: v.matricula },
      });
    }

    // Recalcula os totais da folha a partir dos itens.
    const todos = await tx.folhaItem.findMany({ where: { folhaId: params.id }, select: { bruto: true, liquido: true, inssRetido: true, inssPatronal: true, irrf: true, fgts: true } });
    const soma = (k: "bruto" | "liquido" | "inssRetido" | "inssPatronal" | "irrf" | "fgts") =>
      Math.round(todos.reduce((a, t) => a + num(t[k]), 0) * 100) / 100;
    await tx.folhaPagamento.update({
      where: { id: params.id },
      data: {
        totalBruto: soma("bruto"), totalLiquido: soma("liquido"),
        totalInssRetido: soma("inssRetido"), totalInssPatronal: soma("inssPatronal"),
        totalIrrf: soma("irrf"), totalFgts: soma("fgts"),
      },
    });
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
