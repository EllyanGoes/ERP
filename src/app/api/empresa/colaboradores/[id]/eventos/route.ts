export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import type { TipoEventoColaborador } from "@prisma/client";
import { requireModuloAny } from "@/lib/permissions";
import { prismaSemEscopo as prisma } from "@/lib/prisma";
import { TIPOS_VALIDOS, aplicarEvento } from "@/lib/colaborador-eventos";

// GET /api/empresa/colaboradores/[id]/eventos — histórico funcional + mudanças de função SST.
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModuloAny(["empresa", "rh", "sst"]);
  if (!auth.ok) return auth.response;
  const [eventos, funcoes] = await Promise.all([
    prisma.colaboradorEvento.findMany({ where: { colaboradorId: params.id }, orderBy: [{ data: "desc" }, { createdAt: "desc" }] }),
    prisma.sstColaboradorFuncao.findMany({ where: { colaboradorId: params.id }, orderBy: { inicio: "desc" }, select: { id: true, inicio: true, fim: true, funcao: { select: { nome: true } } } }),
  ]);
  return NextResponse.json({ data: { eventos, funcoes } });
}

// POST { tipo, data, dataFim?, motivo?, detalhes?, observacao?, documentoId? }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModuloAny(["empresa", "rh"]);
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const tipo = String(b.tipo ?? "") as TipoEventoColaborador;
  if (!TIPOS_VALIDOS.includes(tipo)) return NextResponse.json({ error: "Tipo de evento inválido." }, { status: 400 });
  if (!b.data) return NextResponse.json({ error: "Informe a data." }, { status: 400 });
  const data = new Date(b.data);
  const dataFim = b.dataFim ? new Date(b.dataFim) : null;
  if (dataFim && dataFim < data) return NextResponse.json({ error: "A data final não pode ser antes do início." }, { status: 400 });
  const colab = await prisma.colaborador.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!colab) return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
  const ev = await prisma.$transaction(async (tx) => {
    const ev = await tx.colaboradorEvento.create({
      data: {
        colaboradorId: params.id, tipo, data, dataFim,
        motivo: b.motivo || null, detalhes: b.detalhes ?? undefined,
        observacao: String(b.observacao ?? "").trim() || null, documentoId: b.documentoId || null,
        criadoPor: auth.session.nome,
      },
    });
    await aplicarEvento(tx, ev);
    return ev;
  });
  return NextResponse.json({ data: ev }, { status: 201 });
}
