export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { vencimentoInicial } from "@/lib/manutencao/preventivas";

type Ctx = { params: Promise<{ id: string }> };

/** Monta/valida os campos de gatilho da aplicação do plano ao ativo. */
function gatilho(b: Record<string, unknown>): Prisma.ManutPlanoAtivoUncheckedUpdateInput | string {
  const g = b.gatilho === "MEDIDOR" ? "MEDIDOR" : "CALENDARIO";
  const ultima = b.ultimaExecucao ? new Date(String(b.ultimaExecucao)) : null;
  if (g === "CALENDARIO") {
    const dias = Math.round(Number(b.intervaloDias));
    if (!Number.isFinite(dias) || dias < 1) return "Informe o intervalo em dias.";
    return { gatilho: g, intervaloDias: dias, medidorId: null, intervaloMedida: null, ultimaExecucao: ultima, proximoVencimento: vencimentoInicial(ultima, dias) };
  }
  const intervalo = Number(b.intervaloMedida);
  if (!b.medidorId) return "Escolha o medidor (cadastre um horímetro no ativo).";
  if (!Number.isFinite(intervalo) || intervalo <= 0) return "Informe o intervalo do medidor.";
  const ultimaMedida = b.ultimaMedida === "" || b.ultimaMedida == null ? null : Number(b.ultimaMedida);
  return {
    gatilho: g, medidorId: String(b.medidorId), intervaloMedida: intervalo, intervaloDias: null,
    ultimaExecucao: ultima, ultimaMedida, proximaMedida: (ultimaMedida ?? 0) + intervalo,
  };
}

// POST { ativoId, gatilho, intervaloDias? | medidorId + intervaloMedida + ultimaMedida?, ultimaExecucao? }
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const plano = await prisma.manutPlano.findUnique({ where: { id }, select: { id: true } });
  if (!plano) return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const ativo = b.ativoId ? await prisma.manutAtivo.findUnique({ where: { id: b.ativoId }, select: { id: true } }) : null;
  if (!ativo) return NextResponse.json({ error: "Escolha o ativo." }, { status: 400 });
  const g = gatilho(b);
  if (typeof g === "string") return NextResponse.json({ error: g }, { status: 400 });
  const pa = await prismaSemEscopo.manutPlanoAtivo.create({ data: { ...(g as Prisma.ManutPlanoAtivoUncheckedCreateInput), planoId: id, ativoId: ativo.id } });
  return NextResponse.json({ data: pa }, { status: 201 });
}

// PATCH { paId, ...gatilho, ativo? }
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const plano = await prisma.manutPlano.findUnique({ where: { id }, select: { id: true } });
  if (!plano) return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const pa = await prismaSemEscopo.manutPlanoAtivo.findFirst({ where: { id: b.paId, planoId: id } });
  if (!pa) return NextResponse.json({ error: "Aplicação não encontrada." }, { status: 404 });
  let data: Prisma.ManutPlanoAtivoUncheckedUpdateInput = {};
  if ("gatilho" in b) {
    const g = gatilho(b);
    if (typeof g === "string") return NextResponse.json({ error: g }, { status: 400 });
    data = g;
  }
  if ("ativo" in b) data.ativo = !!b.ativo;
  await prismaSemEscopo.manutPlanoAtivo.update({ where: { id: pa.id }, data });
  return NextResponse.json({ ok: true });
}

// DELETE ?paId=
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const plano = await prisma.manutPlano.findUnique({ where: { id }, select: { id: true } });
  if (!plano) return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
  await prismaSemEscopo.manutPlanoAtivo.deleteMany({ where: { id: req.nextUrl.searchParams.get("paId") ?? "", planoId: id } });
  return NextResponse.json({ ok: true });
}
