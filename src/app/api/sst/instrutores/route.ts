export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";

// GET /api/sst/instrutores?todos=1 — instrutores de treinamento da empresa ativa.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const todos = new URL(req.url).searchParams.get("todos") === "1";
  const data = await prisma.sstInstrutor.findMany({
    where: todos ? {} : { ativo: true },
    orderBy: { nome: "asc" },
    include: { _count: { select: { turmas: true } } },
  });
  return NextResponse.json({ data });
}

// POST /api/sst/instrutores { nome, entidade?, registro? } | { colaboradorId }
// Com colaboradorId vira instrutor interno: nome do colaborador e entidade = a
// própria empresa. Se já existe instrutor para o colaborador, devolve o existente.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  if (b.colaboradorId) {
    const ja = await prisma.sstInstrutor.findFirst({ where: { colaboradorId: String(b.colaboradorId) } });
    if (ja) return NextResponse.json({ data: ja });
    const c = await prismaSemEscopo.colaborador.findUnique({ where: { id: String(b.colaboradorId) }, select: { id: true, nome: true } });
    if (!c) return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
    const emp = await prismaSemEscopo.empresa.findUnique({ where: { id: empresaId }, select: { nomeFantasia: true, razaoSocial: true } });
    const data = await prisma.sstInstrutor.create({
      data: { empresaId, nome: c.nome, colaboradorId: c.id, entidade: emp?.nomeFantasia || emp?.razaoSocial || null, registro: String(b.registro ?? "").trim() || null },
    });
    return NextResponse.json({ data }, { status: 201 });
  }
  const nome = String(b.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "Informe o nome do instrutor." }, { status: 400 });
  const data = await prisma.sstInstrutor.create({
    data: { empresaId, nome, entidade: String(b.entidade ?? "").trim() || null, registro: String(b.registro ?? "").trim() || null },
  });
  return NextResponse.json({ data }, { status: 201 });
}
