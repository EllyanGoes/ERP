export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import type { Prisma, TipoCentroTrabalho } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const TIPOS: TipoCentroTrabalho[] = [
  "PREPARACAO", "CONFORMACAO", "SECAGEM", "FORNO", "EMBALAGEM", "TRANSPORTE", "OUTRO",
];
function parseTipo(v: unknown): TipoCentroTrabalho | null {
  return typeof v === "string" && (TIPOS as string[]).includes(v) ? (v as TipoCentroTrabalho) : null;
}
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const data = await prisma.centroTrabalho.findUnique({ where: { id: params.id } });
  if (!data) return NextResponse.json({ error: "Centro de trabalho não encontrado" }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });

  const data: Prisma.CentroTrabalhoUpdateInput = {};
  if (typeof body.codigo === "string") data.codigo = body.codigo.trim();
  if (typeof body.nome === "string") data.nome = body.nome.trim();
  if ("tipo" in body) data.tipo = parseTipo(body.tipo);
  if ("codApl" in body) {
    const n = numOrNull(body.codApl);
    data.codApl = n != null ? Math.trunc(n) : null;
  }
  if ("capacidadePadrao" in body) data.capacidadePadrao = numOrNull(body.capacidadePadrao);
  if ("unidadeCapacidade" in body) {
    data.unidadeCapacidade = typeof body.unidadeCapacidade === "string" ? body.unidadeCapacidade.trim() || null : null;
  }
  if ("observacao" in body) {
    data.observacao = typeof body.observacao === "string" ? body.observacao.trim() || null : null;
  }
  if ("ativo" in body) data.ativo = body.ativo !== false;

  try {
    const updated = await prisma.centroTrabalho.update({ where: { id: params.id }, data });
    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json({ error: "Não foi possível atualizar (código já existe?)." }, { status: 400 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  try {
    await prisma.centroTrabalho.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Não foi possível excluir." }, { status: 400 });
  }
}
