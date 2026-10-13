export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { salvarNaLixeira } from "@/lib/lixeira";

const INCLUDE = {
  setor: { select: { id: true, nome: true } }, maquina: { select: { id: true, nome: true } }, colaborador: { select: { id: true, nome: true } },
  acoes: { orderBy: { createdAt: "asc" as const }, include: { responsavel: { select: { id: true, nome: true } } } },
};
const STATUS = ["ABERTO", "EM_INVESTIGACAO", "ACAO_DEFINIDA", "ENCERRADO"];

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const i = await prisma.sstIncidente.findUnique({ where: { id: params.id }, include: INCLUDE });
  if (!i) return NextResponse.json({ error: "Incidente não encontrado" }, { status: 404 });
  return NextResponse.json({ data: i });
}

// PATCH — campos, investigação, CAT, status (ENCERRADO exige ações concluídas e CAT quando exigida), evidências.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const atual = await prisma.sstIncidente.findUnique({ where: { id: params.id }, select: { tipo: true, catNumero: true, acoes: { select: { concluidaEm: true } } } });
  if (!atual) return NextResponse.json({ error: "Incidente não encontrado" }, { status: 404 });
  const data: Record<string, unknown> = {};
  for (const k of ["local", "parteCorpo", "agente", "investigacao", "descricao", "catNumero"]) if (b[k] !== undefined) data[k] = b[k]?.trim() || null;
  if (b.descricao !== undefined && !data.descricao) return NextResponse.json({ error: "Descrição obrigatória" }, { status: 400 });
  if (b.data !== undefined) data.data = new Date(b.data);
  if (b.setorId !== undefined) data.setorId = b.setorId || null;
  if (b.maquinaId !== undefined) data.maquinaId = b.maquinaId || null;
  if (b.colaboradorId !== undefined) data.colaboradorId = b.colaboradorId || null;
  if (b.diasAfastamento !== undefined) data.diasAfastamento = b.diasAfastamento ? Number(b.diasAfastamento) : null;
  if (b.catEmitidaEm !== undefined) data.catEmitidaEm = b.catEmitidaEm ? new Date(b.catEmitidaEm) : null;
  if (b.catDocumentoId !== undefined) data.catDocumentoId = b.catDocumentoId || null;
  if (b.evidencias !== undefined) data.evidencias = Array.isArray(b.evidencias) ? b.evidencias.filter((x: unknown) => typeof x === "string") : [];
  if (b.status !== undefined) {
    if (!STATUS.includes(b.status)) return NextResponse.json({ error: "Status inválido" }, { status: 400 });
    if (b.status === "ENCERRADO") {
      const exigeCat = ["ACIDENTE_COM_AFASTAMENTO", "DOENCA_OCUPACIONAL", "TRAJETO"].includes(atual.tipo);
      if (exigeCat && !(data.catNumero ?? atual.catNumero)) return NextResponse.json({ error: "Este tipo de ocorrência exige CAT — informe o número antes de encerrar." }, { status: 400 });
      if (atual.acoes.some((a) => !a.concluidaEm)) return NextResponse.json({ error: "Há ações corretivas em aberto. Conclua-as antes de encerrar." }, { status: 400 });
    }
    data.status = b.status;
  }
  const i = await prisma.sstIncidente.update({ where: { id: params.id }, data, include: INCLUDE });
  return NextResponse.json({ data: i });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const i = await prisma.sstIncidente.findUnique({ where: { id: params.id }, include: INCLUDE });
  if (!i) return NextResponse.json({ error: "Incidente não encontrado" }, { status: 404 });
  await prismaSemEscopo.$transaction(async (tx) => {
    await salvarNaLixeira(tx, { empresaId: i.empresaId, tipo: "SST_REGISTRO", origemId: i.id, numero: i.numero, descricao: `Incidente ${i.numero}`, snapshot: i, apagadoPor: auth.session.nome });
    await tx.sstIncidente.delete({ where: { id: params.id } });
  });
  return NextResponse.json({ ok: true });
}
