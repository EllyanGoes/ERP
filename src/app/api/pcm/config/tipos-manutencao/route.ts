export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// Quais tipos de OS contam como falha / parada não planejada no MTBF/MTTR.
// Fonte da verdade: ManutTipo.contaComoFalha (substitui a antiga chave
// pcm_tipos_corretivos com CODTIPMAN do Engeman).

export interface TipoManutencao {
  id: string;
  sigla: string;
  descricao: string; // ManutTipo.nome
  natureza: string;
  ativo: boolean;
  conta: boolean; // contaComoFalha
}

export interface TiposResponse {
  tipos: TipoManutencao[];
  source: "db";
}

// ── GET: lista os tipos de OS + marca quais contam hoje ──────────────────────────
export async function GET() {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;

  const lista = await prisma.manutTipo.findMany({
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    select: { id: true, sigla: true, nome: true, natureza: true, ativo: true, contaComoFalha: true },
  });

  const tipos: TipoManutencao[] = lista.map((t) => ({
    id: t.id,
    sigla: t.sigla,
    descricao: t.nome,
    natureza: t.natureza,
    ativo: t.ativo,
    conta: t.contaComoFalha,
  }));

  return NextResponse.json({ tipos, source: "db" } satisfies TiposResponse);
}

// ── PUT: salva quais tipos contam (ManutTipo.contaComoFalha) ─────────────────────
export async function PUT(req: NextRequest) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  if (!body || !Array.isArray(body.ids)) {
    return NextResponse.json({ error: "Envie ids: string[]" }, { status: 400 });
  }

  const ids = Array.from(
    new Set(body.ids.filter((v): v is string => typeof v === "string" && v.trim() !== "")),
  );
  if (ids.length === 0) {
    return NextResponse.json(
      { error: "Selecione ao menos um tipo que conta como falha" },
      { status: 400 },
    );
  }

  const existentes = await prisma.manutTipo.count({ where: { id: { in: ids } } });
  if (existentes !== ids.length) {
    return NextResponse.json({ error: "Tipo de OS não encontrado" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.manutTipo.updateMany({ where: { id: { in: ids } }, data: { contaComoFalha: true } });
    await tx.manutTipo.updateMany({ where: { id: { notIn: ids } }, data: { contaComoFalha: false } });
  });

  return NextResponse.json({ data: { ids } });
}
