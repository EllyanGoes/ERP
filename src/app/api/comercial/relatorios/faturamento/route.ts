export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";

// Status que representam venda efetivada (faturamento) — exclui orçamento e cancelado.
const STATUS_FATURADO = ["CONFIRMADO", "EM_AGENDAMENTO", "CONCLUIDO"] as const;

function parseDate(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(value);
  return isNaN(d.getTime()) ? fallback : d;
}

// GET /api/comercial/relatorios/faturamento?from=YYYY-MM-DD&to=YYYY-MM-DD
// Retorna os pedidos faturados no período (por data de emissão) para que o
// front agregue por dia e faça drill-down por cliente / pedido.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const hoje = new Date();
  const defaultTo = hoje;
  const defaultFrom = new Date(hoje);
  defaultFrom.setDate(defaultFrom.getDate() - 29); // últimos 30 dias

  const from = parseDate(searchParams.get("from"), defaultFrom);
  const to = parseDate(searchParams.get("to"), defaultTo);
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);

  const pedidos = await prisma.pedidoVenda.findMany({
    where: {
      status: { in: [...STATUS_FATURADO] },
      dataEmissao: { gte: from, lte: to },
    },
    select: {
      id: true,
      numero: true,
      status: true,
      dataEmissao: true,
      valorTotal: true,
      cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
    },
    orderBy: { dataEmissao: "asc" },
  });

  const data = pedidos.map((p) => ({
    id: p.id,
    numero: p.numero,
    status: p.status,
    data: p.dataEmissao.toISOString().slice(0, 10), // YYYY-MM-DD
    valor: decimalToNumber(p.valorTotal),
    clienteId: p.cliente.id,
    clienteNome: p.cliente.nomeFantasia || p.cliente.razaoSocial,
  }));

  return NextResponse.json({
    data,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  });
}
