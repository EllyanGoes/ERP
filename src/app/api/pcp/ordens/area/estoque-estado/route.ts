export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

function slug(s: string): string {
  return (
    s.normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase().slice(0, 24) || "PROD"
  );
}
const r3 = (n: number) => Math.round(n * 1000) / 1000;

// GET /api/pcp/ordens/area/estoque-estado?fluxoId=&estado=ESTADO
// Saldo do PEP (WIP-<produto>-<estado>) — ou do PRODUTO ACABADO quando estado=ACABADO —
// por produto fabricável do fluxo, aberto por local. Usado nas colunas Entrada/Saída do board.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const sp = new URL(req.url).searchParams;
  const fluxoId = sp.get("fluxoId") ?? "";
  const estado = sp.get("estado") ?? "";
  if (!fluxoId || !estado) return NextResponse.json({ data: [] });

  // Só os produtos FINAIS (vendáveis) percorrem a cadeia de WIP até o acabado —
  // intermediários (Mistura de Argila, Insumos para Queima) não aparecem nas etapas do tijolo.
  const engs = await prisma.engenhariaProduto.findMany({
    where: { fluxoId, ativo: true, item: { vendavel: true } },
    select: { item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true, unidade: { select: { sigla: true } },
      itemUnidades: { select: { fatorConversao: true, unidade: { select: { sigla: true } } } } } } },
  });
  const produtos = engs.map((e) => e.item).filter((x): x is NonNullable<typeof x> => !!x);
  if (!produtos.length) return NextResponse.json({ data: [] });

  // Item-alvo de cada produto: o próprio (ACABADO) ou o item WIP do estado.
  const alvoPorProduto = new Map<string, { itemId: string | null; codigo: string }>();
  const wipCodigos: string[] = [];
  for (const p of produtos) {
    if (estado === "ACABADO") alvoPorProduto.set(p.id, { itemId: p.id, codigo: p.codigo });
    else { const c = `WIP-${slug(p.codigo)}-${estado}`; alvoPorProduto.set(p.id, { itemId: null, codigo: c }); wipCodigos.push(c); }
  }
  // Resolve os itens WIP por código (podem ainda não existir → saldo 0).
  if (wipCodigos.length) {
    const wips = await prisma.item.findMany({ where: { codigo: { in: wipCodigos } }, select: { id: true, codigo: true } });
    const idPorCodigo = new Map(wips.map((w) => [w.codigo, w.id]));
    for (const alvo of Array.from(alvoPorProduto.values())) if (!alvo.itemId) alvo.itemId = idPorCodigo.get(alvo.codigo) ?? null;
  }

  const ids = Array.from(alvoPorProduto.values()).map((a) => a.itemId).filter((x): x is string => !!x);
  const estoques = ids.length
    ? await prisma.estoqueItem.groupBy({ by: ["itemId", "localEstoqueId"], where: { itemId: { in: ids }, clienteDonoId: null }, _sum: { quantidadeAtual: true } })
    : [];
  const localIds = Array.from(new Set(estoques.map((e) => e.localEstoqueId).filter((x): x is string => !!x)));
  const locais = localIds.length ? await prisma.localEstoque.findMany({ where: { id: { in: localIds } }, select: { id: true, nome: true } }) : [];
  const nomeLocal = new Map(locais.map((l) => [l.id, l.nome]));

  const data = produtos.map((p) => {
    const alvo = alvoPorProduto.get(p.id)!;
    const porLocal = alvo.itemId
      ? estoques.filter((e) => e.itemId === alvo.itemId).map((e) => ({ localNome: e.localEstoqueId ? (nomeLocal.get(e.localEstoqueId) ?? "—") : "Sem local", saldo: r3(Number(e._sum.quantidadeAtual ?? 0)) })).filter((l) => Math.abs(l.saldo) > 0.0005).sort((a, b) => b.saldo - a.saldo)
      : [];
    // Peças/palete do produto (unidade PLT) — o board mostra o ACABADO em paletes
    // e usa o produtoItemId p/ achar a capacidade por vagão/vagoneta (cadastro de cargas).
    const iuPlt = p.itemUnidades.find((u) => /^PLT$/i.test(u.unidade?.sigla ?? "") && u.fatorConversao != null && Number(u.fatorConversao) > 0);
    return {
      itemId: alvo.itemId,
      produtoItemId: p.id,
      pecasPorPalete: iuPlt ? Number(iuPlt.fatorConversao) : null,
      descricao: p.descricao,
      unidade: p.unidade?.sigla ?? p.unidadeMedida ?? null,
      saldoTotal: r3(porLocal.reduce((s, l) => s + l.saldo, 0)),
      locais: porLocal,
    };
  });

  return NextResponse.json({ data });
}
