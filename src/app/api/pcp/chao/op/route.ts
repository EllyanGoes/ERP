export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { criarOPParaProduto } from "@/lib/pcp/chao";

// POST /api/pcp/chao/op
// Painel do nó de processo: gera OP(s) para os produtos/quantidades escolhidos.
// body: { etapaNodeId?, itens: [{ itemId, quantidade, unidade? }] }
export async function POST(req: NextRequest) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const itens = Array.isArray(body?.itens) ? body.itens : [];
  if (itens.length === 0) return NextResponse.json({ error: "Informe ao menos um produto e quantidade." }, { status: 400 });

  const criadas: { itemId: string; numero: string }[] = [];
  const puladas: { itemId: string; motivo: string }[] = [];
  for (const it of itens) {
    const itemId = typeof it?.itemId === "string" ? it.itemId : "";
    const quantidade = Number(it?.quantidade);
    if (!itemId || !(quantidade > 0)) { puladas.push({ itemId, motivo: "Produto/quantidade inválidos" }); continue; }
    const r = await criarOPParaProduto({ itemId, quantidadePlanejada: quantidade, unidade: it?.unidade ?? null, criadoPor: "chao" });
    if (r.ok) criadas.push({ itemId, numero: r.numero });
    else puladas.push({ itemId, motivo: r.motivo });
  }
  return NextResponse.json({ data: { criadas, puladas } }, { status: criadas.length ? 201 : 422 });
}
