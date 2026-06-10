export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import type { StatusOrdemProducao } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const STATUS: StatusOrdemProducao[] = ["RASCUNHO", "LIBERADA", "EM_PRODUCAO", "CONCLUIDA", "CANCELADA"];

// GET — ordem + etapas (em ordem) + consumos de biomassa
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const ordem = await prisma.ordemProducao.findUnique({
    where: { id: params.id },
    include: {
      item: { select: { id: true, codigo: true, descricao: true } },
      fluxoVersao: { select: { versao: true, fluxo: { select: { id: true, nome: true } } } },
      etapas: { orderBy: { sequencia: "asc" } },
      consumos: { orderBy: { data: "desc" } },
      movimentacoes: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true, tipo: true, quantidade: true, saldoDepois: true, observacoes: true, createdAt: true,
          item: { select: { codigo: true, descricao: true } },
        },
      },
    },
  });
  if (!ordem) return NextResponse.json({ error: "Ordem não encontrada" }, { status: 404 });
  return NextResponse.json({ data: ordem });
}

// PATCH — muda status / observação da ordem
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as { status?: unknown; observacao?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });

  const data: { status?: StatusOrdemProducao; observacao?: string | null } = {};
  if ("status" in body) {
    if (typeof body.status !== "string" || !(STATUS as string[]).includes(body.status)) {
      return NextResponse.json({ error: "Status inválido" }, { status: 400 });
    }
    data.status = body.status as StatusOrdemProducao;
  }
  if ("observacao" in body) {
    data.observacao = typeof body.observacao === "string" && body.observacao.trim() ? body.observacao.trim() : null;
  }

  try {
    const updated = await prisma.ordemProducao.update({ where: { id: params.id }, data });
    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json({ error: "Não foi possível atualizar." }, { status: 400 });
  }
}

// DELETE — remove a ordem (cascade nas etapas e consumos)
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  try {
    await prisma.ordemProducao.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Não foi possível excluir." }, { status: 400 });
  }
}
