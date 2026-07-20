export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";

function parseDate(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(value);
  return isNaN(d.getTime()) ? fallback : d;
}

// GET /api/comercial/relatorios/faturamento?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// O faturamento é datado conforme a MODALIDADE do pedido:
//  • BALCAO   → fatura na data de conclusão (paga e retira na hora);
//  • AGENDADA → fatura na ENTREGA: cada minuta marcada ENTREGUE conta o valor
//    efetivamente entregue na data da entrega (suporta entregas parciais).
// O front agrega por dia e faz drill-down por cliente / produto.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);

  const hoje = new Date();
  const defaultTo = hoje;
  const defaultFrom = new Date(hoje);
  defaultFrom.setDate(defaultFrom.getDate() - 29); // últimos 30 dias

  const from = parseDate(searchParams.get("from"), defaultFrom);
  const to = parseDate(searchParams.get("to"), defaultTo);
  // Janela ancorada em UTC (os campos de data são gravados em meia-noite UTC e
  // exibidos via getUTC*); setHours dependia do fuso do servidor.
  from.setUTCHours(0, 0, 0, 0);
  to.setUTCHours(23, 59, 59, 999);

  // Critério do que conta como faturado:
  //  • "entrega"      (padrão) → realização: balcão na conclusão + entregas (minuta ENTREGUE);
  //  • "confirmacao"  → pelo pedido: confirmados/em agendamento/concluídos, valor total na emissão.
  const criterio = searchParams.get("criterio") === "confirmacao" ? "confirmacao" : "entrega";

  type Entry = {
    id: string;
    numero: string;
    status: string;
    data: string; // YYYY-MM-DD
    valor: number;
    clienteId: string;
    clienteNome: string;
    itens: { itemId: string; codigo: string; descricao: string; valor: number }[];
  };

  const data: Entry[] = [];

  // ── Critério "confirmacao": conta o pedido inteiro na data de emissão ─────
  // (confirmados, em agendamento e concluídos — exclui orçamento e cancelado).
  if (criterio === "confirmacao") {
    const pedidos = await prisma.pedidoVenda.findMany({
      where: {
        status: { in: ["CONFIRMADO", "EM_AGENDAMENTO", "CONCLUIDO"] },
        dataEmissao: { gte: from, lte: to },
      },
      select: {
        id: true, numero: true, status: true, dataEmissao: true, valorTotal: true,
        cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        itens: { select: { valorTotal: true, item: { select: { id: true, codigo: true, descricao: true } } } },
      },
    });
    for (const p of pedidos) {
      data.push({
        id: p.id,
        numero: p.numero,
        status: p.status,
        data: p.dataEmissao.toISOString().slice(0, 10),
        valor: decimalToNumber(p.valorTotal),
        clienteId: p.cliente.id,
        clienteNome: p.cliente.nomeFantasia || p.cliente.razaoSocial,
        itens: p.itens.map((it) => ({
          itemId: it.item.id, codigo: it.item.codigo, descricao: it.item.descricao,
          valor: decimalToNumber(it.valorTotal),
        })),
      });
    }

    data.sort((a, b) => a.data.localeCompare(b.data));
    return NextResponse.json({
      data,
      criterio,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    });
  }

  // ── Balcão: faturado na data de conclusão ─────────────────────────────────
  const balcao = await prisma.pedidoVenda.findMany({
    where: {
      modalidade: "BALCAO",
      status: "CONCLUIDO",
      dataConclusao: { gte: from, lte: to },
    },
    select: {
      id: true, numero: true, status: true, dataConclusao: true, valorTotal: true,
      cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      itens: { select: { valorTotal: true, item: { select: { id: true, codigo: true, descricao: true } } } },
    },
  });

  // ── Agendada: faturado a cada entrega (minuta ENTREGUE) ───────────────────
  const entregas = await prisma.minuta.findMany({
    where: {
      status: "ENTREGUE",
      dataEntrega: { gte: from, lte: to },
      pedidoVenda: { modalidade: "AGENDADA", status: { not: "CANCELADO" } },
    },
    select: {
      id: true, numero: true, dataEntrega: true,
      pedidoVenda: {
        select: {
          id: true, numero: true, status: true,
          cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        },
      },
      itens: {
        select: {
          quantidade: true,
          item: { select: { id: true, codigo: true, descricao: true } },
          pedidoVendaItem: { select: { precoUnitario: true } },
        },
      },
    },
  });

  for (const p of balcao) {
    data.push({
      id: p.id,
      numero: p.numero,
      status: p.status,
      data: (p.dataConclusao ?? from).toISOString().slice(0, 10),
      valor: decimalToNumber(p.valorTotal),
      clienteId: p.cliente.id,
      clienteNome: p.cliente.nomeFantasia || p.cliente.razaoSocial,
      itens: p.itens.map((it) => ({
        itemId: it.item.id, codigo: it.item.codigo, descricao: it.item.descricao,
        valor: decimalToNumber(it.valorTotal),
      })),
    });
  }

  for (const m of entregas) {
    if (!m.dataEntrega) continue;
    const itens = m.itens.map((mi) => ({
      itemId: mi.item.id, codigo: mi.item.codigo, descricao: mi.item.descricao,
      valor: decimalToNumber(mi.quantidade) * decimalToNumber(mi.pedidoVendaItem.precoUnitario),
    }));
    const valor = itens.reduce((s, it) => s + it.valor, 0);
    data.push({
      id: m.id,
      numero: m.pedidoVenda.numero,
      status: m.pedidoVenda.status,
      data: m.dataEntrega.toISOString().slice(0, 10),
      valor,
      clienteId: m.pedidoVenda.cliente.id,
      clienteNome: m.pedidoVenda.cliente.nomeFantasia || m.pedidoVenda.cliente.razaoSocial,
      itens,
    });
  }

  data.sort((a, b) => a.data.localeCompare(b.data));

  return NextResponse.json({
    data,
    criterio,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  });
}
