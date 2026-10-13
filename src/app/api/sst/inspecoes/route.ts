export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { salvarNaLixeira } from "@/lib/lixeira";

const INCLUDE = { maquina: { select: { id: true, nome: true } }, responsavel: { select: { id: true, nome: true } }, acoes: { orderBy: { createdAt: "asc" as const }, include: { responsavel: { select: { id: true, nome: true } } } } };

export async function GET() {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const data = await prisma.sstInspecao.findMany({ orderBy: { data: "desc" }, take: 500, include: INCLUDE });
  return NextResponse.json({ data });
}

// POST { tipo, descricao, data, proxima?, resultado, maquinaId?, itens?: [{item, ok, obs}], responsavelId?, documentoId?, observacoes? }
export async function POST(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const descricao = String(b.descricao ?? "").trim();
  const tipo = String(b.tipo ?? "").trim();
  if (!descricao || !tipo) return NextResponse.json({ error: "Informe tipo e descrição." }, { status: 400 });
  const itens = Array.isArray(b.itens) ? b.itens.filter((i: { item?: string }) => i?.item) : null;
  const resultado = b.resultado === "NAO_CONFORME" || (itens && itens.some((i: { ok?: boolean }) => i.ok === false)) ? "NAO_CONFORME" : "CONFORME";
  const ins = await prisma.sstInspecao.create({
    data: {
      empresaId: auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID, tipo, descricao, data: b.data ? new Date(b.data) : new Date(), proxima: b.proxima ? new Date(b.proxima) : null,
      resultado, maquinaId: b.maquinaId || null, itens: itens ?? undefined, responsavelId: b.responsavelId || auth.session.sub, documentoId: b.documentoId || null, observacoes: b.observacoes?.trim() || null,
    },
    include: INCLUDE,
  });
  return NextResponse.json({ data: ins }, { status: 201 });
}

// DELETE ?id=
export async function DELETE(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const ins = await prisma.sstInspecao.findUnique({ where: { id }, include: INCLUDE });
  if (!ins) return NextResponse.json({ error: "Inspeção não encontrada" }, { status: 404 });
  await prismaSemEscopo.$transaction(async (tx) => {
    await salvarNaLixeira(tx, { empresaId: ins.empresaId, tipo: "SST_REGISTRO", origemId: ins.id, numero: null, descricao: `Inspeção ${ins.tipo} — ${ins.descricao}`, snapshot: ins, apagadoPor: auth.session.nome });
    await tx.sstInspecao.delete({ where: { id } });
  });
  return NextResponse.json({ ok: true });
}
