export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { resolverAtivo, requireInvestimentos } from "@/lib/investimentos";

// POST — { ticker, tipo: COMPRA|VENDA, data: "YYYY-MM-DD", quantidade, preco, custos? }
export async function POST(req: NextRequest) {
  const auth = await requireInvestimentos();
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const tipo = body.tipo === "VENDA" ? "VENDA" : "COMPRA";
  const quantidade = Number(body.quantidade);
  const preco = Number(body.preco);
  const custos = Number(body.custos ?? 0);
  if (!body.ticker || !body.data || !(quantidade > 0) || !(preco > 0) || custos < 0 || isNaN(custos)) {
    return NextResponse.json({ error: "Informe ticker, data, quantidade e preço válidos." }, { status: 400 });
  }
  const ativo = await resolverAtivo(String(body.ticker));
  if (!ativo) return NextResponse.json({ error: "Ticker inválido." }, { status: 400 });

  const op = await prismaSemEscopo.investOperacao.create({
    data: {
      usuarioId: auth.session.sub,
      ativoId: ativo.id,
      tipo,
      data: new Date(`${String(body.data).slice(0, 10)}T12:00:00Z`),
      quantidade, preco, custos,
    },
  });
  return NextResponse.json({ data: { id: op.id } }, { status: 201 });
}

// DELETE ?id= — só do próprio usuário.
export async function DELETE(req: NextRequest) {
  const auth = await requireInvestimentos();
  if (!auth.ok) return auth.response;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório." }, { status: 400 });
  await prismaSemEscopo.investOperacao.deleteMany({ where: { id, usuarioId: auth.session.sub } });
  return NextResponse.json({ ok: true });
}
