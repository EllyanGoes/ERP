export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const data = req.nextUrl.searchParams.get("data"); // "YYYY-MM-DD"
  if (!data) return NextResponse.json({ error: "data obrigatória" }, { status: 400 });

  const inicio = new Date(`${data}T00:00:00`);
  const fim = new Date(`${data}T23:59:59`);

  const [cr, cp] = await Promise.all([
    prisma.contaReceber.findMany({
      where: {
        status: { notIn: ["CANCELADA"] },
        dataVencimento: { gte: inicio, lte: fim },
      },
      orderBy: { dataVencimento: "asc" },
      select: {
        id: true,
        numero: true,
        descricao: true,
        valorOriginal: true,
        valorPago: true,
        status: true,
        cliente: { select: { razaoSocial: true } },
        pedidoVenda: { select: { numero: true } },
      },
    }),
    prisma.contaPagar.findMany({
      where: {
        status: { notIn: ["CANCELADA"] },
        dataVencimento: { gte: inicio, lte: fim },
      },
      orderBy: { dataVencimento: "asc" },
      select: {
        id: true,
        numero: true,
        descricao: true,
        categoria: true,
        valorOriginal: true,
        valorPago: true,
        status: true,
        fornecedor: { select: { razaoSocial: true } },
      },
    }),
  ]);

  const totalCR = cr.reduce((s, c) => s + parseFloat(c.valorOriginal.toString()), 0);
  const totalCP = cp.reduce((s, c) => s + parseFloat(c.valorOriginal.toString()), 0);

  return NextResponse.json({ cr, cp, totalCR, totalCP, data });
}
