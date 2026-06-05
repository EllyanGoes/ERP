export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { BaseConsumo, CategoriaInsumo } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const BASES: BaseConsumo[] = ["POR_MILHEIRO", "POR_UNIDADE", "POR_CICLO", "POR_VAGAO"];
const CATEGORIAS: CategoriaInsumo[] = ["MATERIA_PRIMA", "MISTURA", "EMBALAGEM", "ENERGIA", "OUTRO"];

// GET — engenharia + insumos (com item de cada insumo)
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const eng = await prisma.engenhariaProduto.findUnique({
    where: { id: params.id },
    include: {
      item: { select: { id: true, codigo: true, descricao: true } },
      fluxo: { select: { id: true, nome: true } },
      insumos: {
        orderBy: { createdAt: "asc" },
        include: { insumoItem: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } } },
      },
    },
  });
  if (!eng) return NextResponse.json({ error: "Engenharia não encontrada" }, { status: 404 });
  return NextResponse.json({ data: eng });
}

// PATCH — atualiza fluxo/ativo/observação e (se enviado) SUBSTITUI a lista de insumos
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });

  const engData: { fluxoId?: string; ativo?: boolean; observacao?: string | null } = {};
  if (typeof body.fluxoId === "string" && body.fluxoId) engData.fluxoId = body.fluxoId;
  if ("ativo" in body) engData.ativo = body.ativo !== false;
  if ("observacao" in body) engData.observacao = typeof body.observacao === "string" ? body.observacao.trim() || null : null;

  const temInsumos = Array.isArray(body.insumos);
  const insumos = temInsumos
    ? (body.insumos as unknown[])
        .map((raw) => {
          const r = raw as Record<string, unknown>;
          const insumoItemId = typeof r.insumoItemId === "string" ? r.insumoItemId : "";
          const quantidade = Number(r.quantidade);
          const base = (BASES as string[]).includes(String(r.base)) ? (r.base as BaseConsumo) : "POR_MILHEIRO";
          const categoria = (CATEGORIAS as string[]).includes(String(r.categoria)) ? (r.categoria as CategoriaInsumo) : "MATERIA_PRIMA";
          return { insumoItemId, quantidade, base, categoria, observacao: typeof r.observacao === "string" ? r.observacao.trim() || null : null };
        })
        .filter((x) => x.insumoItemId && Number.isFinite(x.quantidade) && x.quantidade >= 0)
    : [];

  try {
    await prisma.$transaction(async (tx) => {
      if (Object.keys(engData).length) {
        await tx.engenhariaProduto.update({ where: { id: params.id }, data: engData });
      }
      if (temInsumos) {
        await tx.engenhariaInsumo.deleteMany({ where: { engenhariaId: params.id } });
        if (insumos.length) {
          await tx.engenhariaInsumo.createMany({
            data: insumos.map((i) => ({ engenhariaId: params.id, ...i })),
          });
        }
      }
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Não foi possível salvar." }, { status: 400 });
  }
}

// DELETE — remove a engenharia (cascade nos insumos)
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.engenhariaProduto.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Não foi possível excluir." }, { status: 400 });
  }
}
