export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// Clientes disponíveis para virar concorrente: exclui os que JÁ estão vinculados
// a um concorrente. O parâmetro `exceto` mantém disponível o cliente já ligado
// ao próprio concorrente em edição.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const exceto = searchParams.get("exceto") || undefined;

  const usados = await prisma.concorrente.findMany({
    where: { clienteId: { not: null }, ...(exceto ? { id: { not: exceto } } : {}) },
    select: { clienteId: true },
  });
  const usadosSet = new Set(usados.map((u) => u.clienteId));

  const clientes = await prisma.cliente.findMany({
    where: { status: { not: "INATIVO" } },
    select: { id: true, razaoSocial: true, nomeFantasia: true, cpfCnpj: true, tipoPessoa: true },
    orderBy: { razaoSocial: "asc" },
    take: 1000,
  });

  const data = clientes.filter((c) => !usadosSet.has(c.id));
  return NextResponse.json({ data });
}
