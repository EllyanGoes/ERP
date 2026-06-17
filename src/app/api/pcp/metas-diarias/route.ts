export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";

const dateOf = (s: string) => new Date(`${s}T00:00:00.000Z`);

// GET /api/pcp/metas-diarias?data=YYYY-MM-DD — metas do dia (com produto).
export async function GET(req: NextRequest) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const dia = searchParams.get("data") || new Date().toISOString().slice(0, 10);
  const metas = await prisma.metaProducaoDiaria.findMany({
    where: { data: dateOf(dia) },
    include: { item: { select: { id: true, codigo: true, descricao: true } } },
    orderBy: { item: { descricao: "asc" } },
  });
  return NextResponse.json({ data: metas, dia });
}

// POST /api/pcp/metas-diarias
//  - { itemId, data, quantidade } → cria/atualiza a meta do produto no dia.
//  - { data, derivarMps: true }   → cria metas do dia a partir do MPS do mês.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const dia = typeof body?.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.data)
    ? body.data
    : new Date().toISOString().slice(0, 10);

  // Derivar do MPS mensal (rateio por dias úteis).
  if (body?.derivarMps) {
    const periodo = dia.slice(0, 7);
    const planos = await prisma.planoMestre.findMany({ where: { periodo } });
    if (planos.length === 0) return NextResponse.json({ error: "Sem MPS para o mês." }, { status: 422 });
    const d = new Date(Date.UTC(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)) - 1, 1));
    let du = 0; const mes = d.getUTCMonth();
    while (d.getUTCMonth() === mes) { const w = d.getUTCDay(); if (w !== 0 && w !== 6) du++; d.setUTCDate(d.getUTCDate() + 1); }
    du = Math.max(1, du);
    let n = 0;
    for (const p of planos) {
      const q = Math.round((Number(p.quantidade) / du) * 1000) / 1000;
      await prisma.metaProducaoDiaria.upsert({
        where: { empresaId_itemId_data: { empresaId: EMPRESA_PADRAO_ID, itemId: p.itemId, data: dateOf(dia) } },
        update: { quantidade: q, origem: "MPS" },
        create: { empresaId: EMPRESA_PADRAO_ID, itemId: p.itemId, data: dateOf(dia), quantidade: q, origem: "MPS" },
      });
      n++;
    }
    return NextResponse.json({ data: { derivadas: n, dia } });
  }

  const itemId = typeof body?.itemId === "string" ? body.itemId : "";
  const quantidade = Number(body?.quantidade);
  if (!itemId || !Number.isFinite(quantidade) || quantidade < 0) {
    return NextResponse.json({ error: "Produto e quantidade são obrigatórios." }, { status: 400 });
  }
  const meta = await prisma.metaProducaoDiaria.upsert({
    where: { empresaId_itemId_data: { empresaId: EMPRESA_PADRAO_ID, itemId, data: dateOf(dia) } },
    update: { quantidade, origem: "MANUAL", observacao: body?.observacao ?? null },
    create: { empresaId: EMPRESA_PADRAO_ID, itemId, data: dateOf(dia), quantidade, origem: "MANUAL", observacao: body?.observacao ?? null },
  });
  return NextResponse.json({ data: meta }, { status: 201 });
}
