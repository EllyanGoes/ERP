export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { calcularMrp } from "@/lib/pcp/mrp";

// GET — agregações para o dashboard do PCP (só leitura).
export async function GET() {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const [ordensGrp, perdasGrp, biomassaAgg, prodGrp, filaEtapas, demandaAgg, fornos, mrp] = await Promise.all([
    prisma.ordemProducao.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.itemOrdemProducao.groupBy({ by: ["nome"], where: { qtdPerda: { gt: 0 } }, _sum: { qtdPerda: true } }),
    prisma.consumoBiomassa.aggregate({ _sum: { quantidadeKg: true, milheirosProduzidos: true } }),
    prisma.itemOrdemProducao.groupBy({ by: ["estadoSaida"], where: { status: "CONCLUIDA", estadoSaida: { not: null } }, _sum: { qtdSaida: true } }),
    prisma.itemOrdemProducao.findMany({
      where: { status: { in: ["PENDENTE", "EM_EXECUCAO"] }, ordemProducao: { status: { in: ["LIBERADA", "EM_PRODUCAO"] } } },
      select: { centroTrabalho: true },
    }),
    prisma.planoMestre.aggregate({ _sum: { quantidade: true } }),
    prisma.centroTrabalho.findMany({ where: { tipo: "FORNO", ativo: true }, select: { id: true, nome: true, capacidadePadrao: true, unidadeCapacidade: true } }),
    calcularMrp(),
  ]);

  const ordens: Record<string, number> = { RASCUNHO: 0, LIBERADA: 0, EM_PRODUCAO: 0, CONCLUIDA: 0, CANCELADA: 0 };
  for (const g of ordensGrp) ordens[g.status] = g._count._all;

  const perdasPorEtapa = perdasGrp
    .map((g) => ({ nome: g.nome, perda: Number(g._sum.qtdPerda ?? 0) }))
    .sort((a, b) => b.perda - a.perda)
    .slice(0, 8);

  const kg = Number(biomassaAgg._sum.quantidadeKg ?? 0);
  const milh = Number(biomassaAgg._sum.milheirosProduzidos ?? 0);
  const biomassa = { kg, milheiros: milh, porMilheiro: milh > 0 ? Math.round((kg / milh) * 100) / 100 : null };

  const producaoPorEstado: Record<string, number> = { UMIDO: 0, SECO: 0, QUEIMADO: 0, ACABADO: 0 };
  for (const g of prodGrp) if (g.estadoSaida) producaoPorEstado[g.estadoSaida] = Number(g._sum.qtdSaida ?? 0);

  const filaMap = new Map<string, number>();
  for (const e of filaEtapas) {
    const c = e.centroTrabalho ?? "Sem centro";
    filaMap.set(c, (filaMap.get(c) ?? 0) + 1);
  }
  const filaPorCentro = Array.from(filaMap, ([centro, count]) => ({ centro, count })).sort((a, b) => b.count - a.count);

  const mrpCat = new Map<string, number>();
  for (const n of mrp.necessidades) mrpCat.set(n.categoria, (mrpCat.get(n.categoria) ?? 0) + n.liquida);
  const mrpResumo = {
    totalAComprar: Math.round(mrp.necessidades.reduce((a, n) => a + n.liquida, 0) * 1000) / 1000,
    porCategoria: Array.from(mrpCat, ([categoria, liquida]) => ({ categoria, liquida: Math.round(liquida * 1000) / 1000 })),
  };

  return NextResponse.json({
    data: {
      ordens,
      perdasPorEtapa,
      biomassa,
      producaoPorEstado,
      filaPorCentro,
      mrp: mrpResumo,
      demandaTotalMilheiros: Number(demandaAgg._sum.quantidade ?? 0),
      fornos,
    },
    source: "db",
  });
}
