export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";

const INCLUDE = { setor: { select: { id: true, nome: true } }, protecoes: { orderBy: { descricao: "asc" as const } } };
const STATUS = ["NAO_AVALIADA", "NAO_CONFORME", "EM_ADEQUACAO", "CONFORME", "INTERDITADA", "DESATIVADA"];

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const m = await prisma.sstMaquina.findUnique({ where: { id: params.id }, include: INCLUDE });
  if (!m) return NextResponse.json({ error: "Máquina não encontrada" }, { status: 404 });
  // Tarefa de adequação (Projetos): só o resumo, sem FK.
  const tarefa = m.tarefaId ? await prismaSemEscopo.tarefa.findUnique({ where: { id: m.tarefaId }, select: { id: true, titulo: true, concluidaEm: true, prazo: true, projetoId: true, projeto: { select: { nome: true } }, coluna: { select: { nome: true } } } }) : null;
  return NextResponse.json({ data: { ...m, tarefa } });
}

// PATCH — dados, status (CONFORME exige todas as proteções conformes), documentos, tarefaId.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (b.nome !== undefined) { const n = String(b.nome).trim(); if (!n) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 }); data.nome = n; }
  for (const k of ["local", "fabricante", "observacoes"]) if (b[k] !== undefined) data[k] = b[k]?.trim() || null;
  if (b.setorId !== undefined) data.setorId = b.setorId || null;
  if (b.codApl !== undefined) data.codApl = b.codApl ? Number(b.codApl) : null;
  if (b.anoFabricacao !== undefined) data.anoFabricacao = b.anoFabricacao ? Number(b.anoFabricacao) : null;
  if (b.apreciacaoRiscoDocumentoId !== undefined) data.apreciacaoRiscoDocumentoId = b.apreciacaoRiscoDocumentoId || null;
  if (b.manualDocumentoId !== undefined) data.manualDocumentoId = b.manualDocumentoId || null;
  if (b.tarefaId !== undefined) data.tarefaId = b.tarefaId || null;
  if (b.status !== undefined) {
    if (!STATUS.includes(b.status)) return NextResponse.json({ error: "Status inválido" }, { status: 400 });
    if (b.status === "CONFORME") {
      const pend = await prismaSemEscopo.sstMaquinaProtecao.count({ where: { maquinaId: params.id, conforme: false } });
      if (pend > 0) return NextResponse.json({ error: `Há ${pend} proteção(ões) ainda não conforme(s). Marque todas como conformes (com evidência) antes.` }, { status: 400 });
    }
    data.status = b.status;
  }
  const m = await prisma.sstMaquina.update({ where: { id: params.id }, data, include: INCLUDE });
  return NextResponse.json({ data: m });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  await prisma.sstMaquina.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
