export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sincronizarContasColaborador } from "@/lib/conta-contabil";

const CLASSIFS = new Set(["MOD", "MOI", "ADMIN"]);

// POST /api/rh/folhas/[id]/criar-colaborador — cria o cadastro de Colaborador a
// partir de um item da folha (nome/cargo/matrícula/classificação) e já vincula.
// Se existir cadastro com a mesma matrícula ou nome, reusa em vez de duplicar.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  const classificacao = CLASSIFS.has(body.classificacao) ? body.classificacao as "MOD" | "MOI" | "ADMIN" : null;
  if (!itemId) return NextResponse.json({ error: "Informe o item da folha" }, { status: 400 });

  const folha = await prisma.folhaPagamento.findUnique({ where: { id: params.id }, select: { id: true, empresaId: true, status: true } });
  if (!folha) return NextResponse.json({ error: "Folha não encontrada" }, { status: 404 });
  if (folha.status === "FECHADA") return NextResponse.json({ error: "Folha já fechada" }, { status: 422 });

  const item = await prisma.folhaItem.findFirst({
    where: { id: itemId, folhaId: folha.id },
    select: { id: true, nome: true, cargo: true, matricula: true, colaboradorId: true, classificacao: true },
  });
  if (!item) return NextResponse.json({ error: "Item da folha não encontrado" }, { status: 404 });
  if (item.colaboradorId) return NextResponse.json({ error: "Item já vinculado a um colaborador" }, { status: 422 });

  const nome = item.nome.trim();
  if (!nome) return NextResponse.json({ error: "Item sem nome" }, { status: 422 });
  const matricula = item.matricula?.trim() || null;
  const cl = classificacao ?? item.classificacao;

  // Reusa cadastro existente (matrícula, senão nome) p/ não duplicar pessoa.
  let colab = matricula
    ? await prisma.colaborador.findFirst({ where: { matricula }, select: { id: true, nome: true, classificacaoCusto: true } })
    : null;
  colab ??= await prisma.colaborador.findFirst({
    where: { nome: { equals: nome, mode: "insensitive" } },
    select: { id: true, nome: true, classificacaoCusto: true },
  });
  const reusado = !!colab;

  if (colab) {
    // Garante a presença na empresa da folha (conta de Salários a Pagar) e a
    // matrícula aprendida; não mexe na classificação de um cadastro existente.
    await prisma.colaborador.update({
      where: { id: colab.id },
      data: {
        empresas: { connect: { id: folha.empresaId } },
        ...(matricula ? { matricula } : {}),
      },
    });
  } else {
    colab = await prisma.colaborador.create({
      data: {
        nome, matricula, cargo: item.cargo,
        tipoColaborador: "FUNCIONARIO",
        classificacaoCusto: cl,
        empresas: { connect: { id: folha.empresaId } },
      },
      select: { id: true, nome: true, classificacaoCusto: true },
    });
  }
  await sincronizarContasColaborador(colab.id, [folha.empresaId]).catch(() => {});

  await prisma.folhaItem.update({
    where: { id: item.id },
    data: { colaboradorId: colab.id, ...(classificacao ? { classificacao } : {}) },
  });

  return NextResponse.json({ data: { colaborador: colab, reusado } }, { status: reusado ? 200 : 201 });
}
