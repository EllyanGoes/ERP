export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getFluxoChao, saldoDoNo, planejadoDoDia } from "@/lib/pcp/chao";

const NOS_ESTOQUE = new Set(["ESTOQUE_INSUMO", "BUFFER_WIP", "ESTOCAGEM_PA"]);

// GET /api/pcp/chao?fluxoId=&data=YYYY-MM-DD
// Fluxo compartilhado publicado + saldo por nó (estoque/WIP/PA) + plano do dia.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const fluxoId = searchParams.get("fluxoId") || undefined;
  const dia = searchParams.get("data") || new Date().toISOString().slice(0, 10);

  const fluxo = await getFluxoChao(fluxoId);
  if (!fluxo) return NextResponse.json({ data: null, error: "Nenhum fluxo de processo publicado." });

  // Saldo de cada nó de estoque/WIP/PA (todos os produtos naquela fase).
  const nosEstoque = fluxo.grafo.nodes.filter((n) => NOS_ESTOQUE.has(n.type));
  const saldosArr = await Promise.all(nosEstoque.map(async (n) => [n.id, await saldoDoNo(n)] as const));
  const saldos = Object.fromEntries(saldosArr);

  // Plano do dia (com nome dos produtos).
  const alvos = await planejadoDoDia(dia);
  const itens = alvos.length
    ? await prisma.item.findMany({ where: { id: { in: alvos.map((a) => a.itemId) } }, select: { id: true, codigo: true, descricao: true } })
    : [];
  const nomeById = new Map(itens.map((i) => [i.id, i]));
  const plano = alvos.map((a) => ({
    ...a,
    codigo: nomeById.get(a.itemId)?.codigo ?? null,
    descricao: nomeById.get(a.itemId)?.descricao ?? a.itemId,
  }));

  return NextResponse.json({ data: { fluxo, saldos, plano, data: dia } });
}
