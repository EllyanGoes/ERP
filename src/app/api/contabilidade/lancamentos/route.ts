export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";

// GET /api/contabilidade/lancamentos?limit=100
// Diário contábil da empresa ativa (escopo do prisma).
export async function GET(req: NextRequest) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);

  const data = await prisma.lancamentoContabil.findMany({
    orderBy: [{ data: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true, data: true, historico: true, origemTipo: true, origemId: true, estornoDeId: true,
      partidas: {
        select: {
          id: true, tipo: true, valor: true,
          conta: { select: { codigo: true, nome: true } },
        },
      },
    },
  });

  return NextResponse.json({ data });
}
