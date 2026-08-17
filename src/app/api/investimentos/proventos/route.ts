export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { resolverAtivo, requireInvestimentos } from "@/lib/investimentos";

const TIPOS = ["DIVIDENDO", "JCP", "RENDIMENTO", "OUTRO"] as const;

// POST — { ticker, tipo, data: "YYYY-MM-DD", valor }
export async function POST(req: NextRequest) {
  const auth = await requireInvestimentos();
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const valor = Number(body.valor);
  const tipo = TIPOS.includes(body.tipo) ? body.tipo : "DIVIDENDO";
  if (!body.ticker || !body.data || !(valor > 0)) {
    return NextResponse.json({ error: "Informe ticker, data e valor válidos." }, { status: 400 });
  }
  const ativo = await resolverAtivo(String(body.ticker));
  if (!ativo) return NextResponse.json({ error: "Ticker inválido." }, { status: 400 });

  const pr = await prismaSemEscopo.investProvento.create({
    data: {
      usuarioId: auth.session.sub,
      ativoId: ativo.id,
      tipo,
      data: new Date(`${String(body.data).slice(0, 10)}T12:00:00Z`),
      valor,
    },
  });
  return NextResponse.json({ data: { id: pr.id } }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireInvestimentos();
  if (!auth.ok) return auth.response;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório." }, { status: 400 });
  await prismaSemEscopo.investProvento.deleteMany({ where: { id, usuarioId: auth.session.sub } });
  return NextResponse.json({ ok: true });
}
