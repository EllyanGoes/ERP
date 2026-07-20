export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModuloAny } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await requireModuloAny(["dashboard", "comercial"]);
  if (!auth.ok) return auth.response;

  const mes = req.nextUrl.searchParams.get("mes"); // "YYYY-MM"
  if (!mes) return NextResponse.json({ error: "mes obrigatório" }, { status: 400 });

  const [year, month] = mes.split("-").map(Number);
  const inicio = new Date(year, month - 1, 1);
  const fim = new Date(year, month, 1); // exclusive

  const contas = await prisma.contaReceber.findMany({
    where: {
      status: "PAGA",
      dataPagamento: { gte: inicio, lt: fim },
    },
    orderBy: { dataPagamento: "asc" },
    select: {
      id: true,
      numero: true,
      descricao: true,
      valorPago: true,
      dataPagamento: true,
      pedidoVendaId: true,
      cliente: { select: { razaoSocial: true, nomeFantasia: true } },
    },
  });

  const total = contas.reduce((s, c) => s + parseFloat(c.valorPago?.toString() ?? "0"), 0);

  return NextResponse.json({ contas, total, mes });
}
