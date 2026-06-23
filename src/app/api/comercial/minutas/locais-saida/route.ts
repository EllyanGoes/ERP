export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { resolverLocaisSaida } from "@/lib/local-saida";

// Local de saída resolvido automaticamente por item (pela categoria/saldo), para
// exibir na Nova Minuta sem precisar escolher um local único. Mesma regra usada na
// baixa real da minuta (resolverLocaisSaida) — fonte única de verdade.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  const pedidoVendaId = new URL(req.url).searchParams.get("pedidoVendaId");
  if (!pedidoVendaId) {
    return NextResponse.json({ error: "pedidoVendaId obrigatório" }, { status: 400 });
  }

  const pedido = await prismaSemEscopo.pedidoVenda.findUnique({
    where: { id: pedidoVendaId },
    select: { empresaId: true, itens: { select: { itemId: true } } },
  });
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  const itemIds = Array.from(new Set(pedido.itens.map((i) => i.itemId)));
  const mapa = await resolverLocaisSaida(prismaSemEscopo, pedido.empresaId, itemIds, null);

  const localIds = Array.from(new Set(Array.from(mapa.values()).filter((v): v is string => !!v)));
  const locais = localIds.length
    ? await prismaSemEscopo.localEstoque.findMany({ where: { id: { in: localIds } }, select: { id: true, nome: true } })
    : [];
  const nomePorId = new Map(locais.map((l) => [l.id, l.nome]));

  const data = itemIds.map((itemId) => {
    const localId = mapa.get(itemId) ?? null;
    return { itemId, localId, localNome: localId ? (nomePorId.get(localId) ?? null) : null };
  });

  return NextResponse.json({ data });
}
