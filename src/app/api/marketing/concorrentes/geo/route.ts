export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Pontos georreferenciados dos concorrentes para o mapa de geomarketing.
// Retorna apenas quem tem lat/lng definidos.
export async function GET(_: NextRequest) {
  const data = await prisma.concorrente.findMany({
    where: {
      ativo: true,
      latitude: { not: null },
      longitude: { not: null },
    },
    select: {
      id: true,
      razaoSocial: true,
      nomeFantasia: true,
      ehFornecedor: true,
      ehRevendedor: true,
      clienteId: true,
      cidade: true,
      estado: true,
      latitude: true,
      longitude: true,
      _count: { select: { precos: true } },
    },
  });

  return NextResponse.json({ data });
}
