export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const fluxo = await prisma.aprovacaoFluxo.findUnique({
      where: { id: params.id },
      include: {
        etapas: {
          include: {
            aprovador:   { select: { id: true, nome: true, email: true, telefone: true } },
            colaborador: { select: { id: true, nome: true, telefone: true } },
          },
          orderBy: { ordem: "asc" },
        },
      },
    });

    if (!fluxo) {
      return NextResponse.json({ error: "Fluxo não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ data: fluxo });
  } catch (err) {
    console.error("[GET /api/configuracoes/aprovacoes/[id]]", err);
    return NextResponse.json({ error: "Erro ao buscar fluxo" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { nome, ativo, processo, etapas } = body as {
      nome?: string;
      ativo?: boolean;
      processo?: string;
      etapas?: Array<{
        ordem: number;
        nome?: string;
        valorMin?: number | null;
        valorMax?: number | null;
        aprovadorId?:   string;
        colaboradorId?: string;
      }>;
    };

    // Replace etapas entirely if provided
    const fluxo = await prisma.$transaction(async (tx) => {
      if (etapas !== undefined) {
        await tx.aprovacaoEtapa.deleteMany({ where: { fluxoId: params.id } });
      }

      return tx.aprovacaoFluxo.update({
        where: { id: params.id },
        data: {
          ...(nome !== undefined ? { nome: nome.trim() } : {}),
          ...(ativo !== undefined ? { ativo } : {}),
          ...(processo !== undefined ? { processo: processo as import("@prisma/client").ProcessoAprovacao } : {}),
          ...(etapas !== undefined
            ? {
                etapas: {
                  create: etapas.map((e) => ({
                    ordem: e.ordem,
                    nome: e.nome ?? null,
                    valorMin: e.valorMin ?? null,
                    valorMax: e.valorMax ?? null,
                    aprovadorId:   e.aprovadorId   ?? null,
                    colaboradorId: e.colaboradorId ?? null,
                  })),
                },
              }
            : {}),
        },
        include: {
          etapas: {
            include: {
            aprovador:   { select: { id: true, nome: true, email: true, telefone: true } },
            colaborador: { select: { id: true, nome: true, telefone: true } },
          },
            orderBy: { ordem: "asc" },
          },
        },
      });
    });

    return NextResponse.json({ data: fluxo });
  } catch (err) {
    console.error("[PATCH /api/configuracoes/aprovacoes/[id]]", err);
    return NextResponse.json({ error: "Erro ao atualizar fluxo" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    await prisma.aprovacaoFluxo.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/configuracoes/aprovacoes/[id]]", err);
    return NextResponse.json({ error: "Erro ao excluir fluxo" }, { status: 500 });
  }
}
