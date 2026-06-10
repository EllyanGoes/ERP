export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const fluxos = await prisma.aprovacaoFluxo.findMany({
      include: {
        etapas: {
          include: {
            aprovador:   { select: { id: true, nome: true, email: true, telefone: true } },
            colaborador: { select: { id: true, nome: true, telefone: true } },
          },
          orderBy: { ordem: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ data: fluxos });
  } catch (err) {
    console.error("[GET /api/configuracoes/aprovacoes]", err);
    return NextResponse.json({ error: "Erro ao listar fluxos" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { nome, processo, etapas } = body as {
      nome: string;
      processo?: string;
      etapas: Array<{
        ordem: number;
        nome?: string;
        valorMin?: number | null;
        valorMax?: number | null;
        aprovadorId?: string;
        colaboradorId?: string;
      }>;
    };

    if (!nome?.trim()) {
      return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
    }
    if (!etapas || etapas.length === 0) {
      return NextResponse.json({ error: "Adicione pelo menos uma etapa" }, { status: 400 });
    }

    const fluxo = await prisma.aprovacaoFluxo.create({
      data: {
        nome: nome.trim(),
        processo: (processo ?? "SOLICITACAO_COMPRAS") as import("@prisma/client").ProcessoAprovacao,
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

    return NextResponse.json({ data: fluxo }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/configuracoes/aprovacoes]", err);
    return NextResponse.json({ error: "Erro ao criar fluxo" }, { status: 500 });
  }
}
