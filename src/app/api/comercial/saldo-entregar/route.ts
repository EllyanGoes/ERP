export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";

const EPS = 1e-6;

// Saldo a entregar por cliente: o que ainda falta minutar dos pedidos confirmados.
// Mesma regra usada em /comercial/saldo-clientes e na Nova Minuta.
export async function GET() {
  const pedidos = await prisma.pedidoVenda.findMany({
    where: { status: { in: ["CONFIRMADO", "EM_AGENDAMENTO"] } },
    select: {
      id: true,
      numero: true,
      cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      itens: {
        select: {
          quantidade: true,
          minutaItens: {
            where: { minuta: { status: { not: "CANCELADA" } } },
            select: { quantidade: true },
          },
        },
      },
    },
    orderBy: { dataEmissao: "asc" },
  });

  type PedidoSaldo = { id: string; numero: string; itensPendentes: number; totalPendente: number };
  const map = new Map<string, { id: string; nome: string; pedidos: PedidoSaldo[] }>();

  for (const p of pedidos) {
    let itensPendentes = 0;
    let totalPendente = 0;
    for (const it of p.itens) {
      const pedida = decimalToNumber(it.quantidade);
      const minutado = it.minutaItens.reduce((s, mi) => s + decimalToNumber(mi.quantidade), 0);
      const pendente = pedida - minutado;
      if (pendente > EPS) { itensPendentes++; totalPendente += pendente; }
    }
    if (itensPendentes === 0) continue;

    const nome = p.cliente.nomeFantasia || p.cliente.razaoSocial;
    let cli = map.get(p.cliente.id);
    if (!cli) { cli = { id: p.cliente.id, nome, pedidos: [] }; map.set(p.cliente.id, cli); }
    cli.pedidos.push({ id: p.id, numero: p.numero, itensPendentes, totalPendente });
  }

  const data = Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return NextResponse.json({ data });
}
