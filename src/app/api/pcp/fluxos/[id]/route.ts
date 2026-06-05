export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// GET — fluxo + metadados das versões + grafo da última versão (para o editor)
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const fluxo = await prisma.fluxoProducao.findUnique({
    where: { id: params.id },
    include: {
      item: { select: { id: true, codigo: true, descricao: true } },
      versoes: {
        orderBy: { versao: "desc" },
        select: { id: true, versao: true, status: true, publicadoEm: true, publicadoPor: true, createdAt: true, updatedAt: true },
      },
    },
  });
  if (!fluxo) return NextResponse.json({ error: "Fluxo não encontrado" }, { status: 404 });

  const ultima = fluxo.versoes[0] ?? null;
  const grafoRow = ultima
    ? await prisma.fluxoProducaoVersao.findUnique({ where: { id: ultima.id }, select: { grafo: true } })
    : null;

  return NextResponse.json({
    data: {
      id: fluxo.id,
      nome: fluxo.nome,
      descricao: fluxo.descricao,
      itemId: fluxo.itemId,
      item: fluxo.item,
      ativo: fluxo.ativo,
      versaoAtivaId: fluxo.versaoAtivaId,
      versoes: fluxo.versoes,
      versaoAtual: ultima ? { ...ultima, grafo: grafoRow?.grafo ?? { nodes: [], edges: [] } } : null,
    },
  });
}

// PATCH — atualiza dados do fluxo (nome/descrição/produto/ativo)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });

  const data: Prisma.FluxoProducaoUpdateInput = {};
  if (typeof body.nome === "string") data.nome = body.nome.trim();
  if ("descricao" in body) data.descricao = typeof body.descricao === "string" ? body.descricao.trim() || null : null;
  if ("ativo" in body) data.ativo = body.ativo !== false;
  if ("itemId" in body) {
    const itemId = typeof body.itemId === "string" && body.itemId ? body.itemId : null;
    data.item = itemId ? { connect: { id: itemId } } : { disconnect: true };
  }

  try {
    const updated = await prisma.fluxoProducao.update({ where: { id: params.id }, data });
    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json({ error: "Não foi possível atualizar." }, { status: 400 });
  }
}

// DELETE — remove o fluxo (cascade nas versões)
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.fluxoProducao.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Não foi possível excluir." }, { status: 400 });
  }
}
