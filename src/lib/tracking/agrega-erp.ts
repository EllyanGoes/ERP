import type { StatusPedidoVenda } from "@prisma/client";
import { prismaSemEscopo } from "@/lib/prisma";
import { intervaloDiaSP } from "./agrega";

// ─────────────────────────────────────────────────────────────────────────────
// Agregação diária das métricas do ERP (Fase 4) — nós ETAPA_OFFLINE com
// `vinculoErp` no config contam pedidos de venda / clientes novos do dia e
// gravam em MetricaNoDiaria (fonte=ERP), mesma mecânica idempotente do
// agrega.ts (delete+createMany por funil+dia).
//
// PedidoVenda/Cliente são escopados pelo proxy de sessão — aqui é cron, então
// SEMPRE prismaSemEscopo, com filtro explícito de empresaId quando o vínculo
// pedir (filtros.empresaIds).
// ─────────────────────────────────────────────────────────────────────────────

type VinculoErp = {
  tipo: "PEDIDO_VENDA" | "CLIENTE_NOVO";
  filtros?: {
    empresaIds?: string[];
    vendedorId?: string;
    status?: string[];
  };
};

export type ResumoAgregacaoErp = {
  dia: string;
  funis: number;
  nosComMetrica: number;
};

/**
 * Agrega um dia de métricas do ERP em MetricaNoDiaria (fonte=ERP) para os
 * funis ATIVOS com nós ETAPA_OFFLINE vinculados. Idempotente por funil+dia.
 */
export async function agregarDiaErp(data: Date): Promise<ResumoAgregacaoErp> {
  const { dia, inicio, fim, dataMetrica } = intervaloDiaSP(data);

  const funis = await prismaSemEscopo.funil.findMany({
    where: { status: "ATIVO", ativo: true },
    select: {
      id: true,
      nos: {
        where: { ativo: true, tipo: "ETAPA_OFFLINE" },
        select: { noId: true, config: true },
      },
    },
  });
  // Reagrega todo funil que tem nó ETAPA_OFFLINE, mesmo sem vinculoErp: se o
  // vínculo foi removido desde a última rodada, o delete limpa o dia.
  const funisComNos = funis.filter((f) => f.nos.length > 0);

  const resumo: ResumoAgregacaoErp = { dia, funis: 0, nosComMetrica: 0 };
  if (funisComNos.length === 0) return resumo;

  for (const funil of funisComNos) {
    const linhas: {
      funilId: string;
      noId: string;
      data: Date;
      fonte: string;
      conversoes: number;
      receita: number;
    }[] = [];

    for (const no of funil.nos) {
      const vinculo = (no.config as { vinculoErp?: VinculoErp } | null)?.vinculoErp;
      if (!vinculo?.tipo) continue;

      let conversoes = 0;
      let receita = 0;

      if (vinculo.tipo === "PEDIDO_VENDA") {
        const filtros = vinculo.filtros ?? {};
        const agg = await prismaSemEscopo.pedidoVenda.aggregate({
          where: {
            dataEmissao: { gte: inicio, lt: fim },
            ...(filtros.empresaIds?.length ? { empresaId: { in: filtros.empresaIds } } : {}),
            ...(filtros.vendedorId ? { vendedorId: filtros.vendedorId } : {}),
            // Default: só pedidos "de verdade" (exclui orçamento e cancelado).
            status: filtros.status?.length
              ? { in: filtros.status as StatusPedidoVenda[] }
              : { notIn: ["ORCAMENTO", "CANCELADO"] },
          },
          _count: { _all: true },
          _sum: { valorTotal: true },
        });
        conversoes = agg._count._all;
        receita = Number(agg._sum.valorTotal ?? 0);
      } else {
        // CLIENTE_NOVO: clientes cadastrados no dia (sem filtro de empresa —
        // Cliente é cadastro do grupo, não tem empresaId).
        conversoes = await prismaSemEscopo.cliente.count({
          where: { createdAt: { gte: inicio, lt: fim } },
        });
      }

      if (conversoes === 0 && receita === 0) continue;
      linhas.push({
        funilId: funil.id,
        noId: no.noId,
        data: dataMetrica,
        fonte: "ERP",
        conversoes,
        receita,
      });
    }

    // Idempotente: reagrega o funil+dia inteiro (delete+insert), como no
    // agrega.ts.
    await prismaSemEscopo.$transaction([
      prismaSemEscopo.metricaNoDiaria.deleteMany({
        where: { funilId: funil.id, data: dataMetrica, fonte: "ERP" },
      }),
      ...(linhas.length > 0
        ? [prismaSemEscopo.metricaNoDiaria.createMany({ data: linhas })]
        : []),
    ]);
    if (linhas.length > 0) resumo.funis += 1;
    resumo.nosComMetrica += linhas.length;
  }

  return resumo;
}
