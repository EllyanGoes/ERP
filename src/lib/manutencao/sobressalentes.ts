// Sobressalentes da Manutenção × estoque do ERP. O saldo é o físico da empresa
// ativa (EstoqueItem, cliente escopado), somando todos os locais e só o estoque
// PRÓPRIO (clienteDonoId null — mercadoria de terceiro sob guarda não conta).
import { prisma, prismaSemEscopo } from "@/lib/prisma";

/** itemId → saldo próprio somado em todos os locais da empresa ativa. */
export async function saldoProprioPorItem(itemIds: string[]): Promise<Map<string, number>> {
  const ids = Array.from(new Set(itemIds));
  if (ids.length === 0) return new Map();
  const grupos = await prisma.estoqueItem.groupBy({
    by: ["itemId"],
    where: { itemId: { in: ids }, clienteDonoId: null },
    _sum: { quantidadeAtual: true },
  });
  return new Map(grupos.map((g) => [g.itemId, Number(g._sum.quantidadeAtual ?? 0)]));
}

export type SobressalenteAbaixo = {
  id: string;
  ativo: { id: string; codApl: number; tag: string; nome: string };
  item: { id: string; codigo: string; descricao: string };
  saldo: number;
  estoqueMinimo: number;
};

/** Peças com estoque mínimo definido cujo saldo atual está abaixo dele (ativos ativos da empresa). */
export async function sobressalentesAbaixoDoMinimo(): Promise<SobressalenteAbaixo[]> {
  const ativos = await prisma.manutAtivo.findMany({ where: { ativo: true, pecas: { some: { estoqueMinimo: { not: null } } } }, select: { id: true, codApl: true, tag: true, nome: true } });
  if (ativos.length === 0) return [];
  const porId = new Map(ativos.map((a) => [a.id, a]));
  const pecas = await prismaSemEscopo.manutAtivoPeca.findMany({
    where: { ativoId: { in: ativos.map((a) => a.id) }, estoqueMinimo: { not: null } },
    select: { id: true, ativoId: true, estoqueMinimo: true, item: { select: { id: true, codigo: true, descricao: true } } },
  });
  const saldos = await saldoProprioPorItem(pecas.map((p) => p.item.id));
  return pecas
    .map((p) => ({ id: p.id, ativo: porId.get(p.ativoId)!, item: p.item, saldo: saldos.get(p.item.id) ?? 0, estoqueMinimo: Number(p.estoqueMinimo) }))
    .filter((p) => p.saldo < p.estoqueMinimo)
    // mais crítico primeiro: menor cobertura do mínimo
    .sort((a, b) => a.saldo / (a.estoqueMinimo || 1) - b.saldo / (b.estoqueMinimo || 1) || a.ativo.tag.localeCompare(b.ativo.tag));
}
