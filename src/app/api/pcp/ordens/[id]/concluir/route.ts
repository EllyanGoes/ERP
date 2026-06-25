export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { contabilizarProducaoOrdem } from "@/lib/contabilidade";
import { apontarEtapaProducao } from "@/lib/pcp/apontamento";

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// POST — "Concluir produção" em 1 clique: conclui TODAS as etapas pendentes da ordem
// com uma única quantidade produzida (cascata pelo fluxo), consumindo a MP pela
// engenharia e gerando o PA. A biomassa vai na etapa de QUEIMA; a perda, na última.
// Mantém o apontamento etapa-a-etapa intacto (mesmo helper).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const quantidadeProduzida = numOrNull(body?.quantidadeProduzida);
  if (!quantidadeProduzida || quantidadeProduzida <= 0) {
    return NextResponse.json({ error: "Informe a quantidade produzida (> 0)." }, { status: 400 });
  }
  const qtdPerda = numOrNull(body?.qtdPerda);
  const biomassaKg = numOrNull(body?.biomassaKg);
  const apontadoPor = typeof body?.apontadoPor === "string" && body.apontadoPor.trim() ? body.apontadoPor.trim() : null;

  const ordem = await prisma.ordemProducao.findUnique({
    where: { id: params.id },
    select: { id: true, status: true },
  });
  if (!ordem) return NextResponse.json({ error: "Ordem não encontrada" }, { status: 404 });
  if (ordem.status === "CANCELADA") return NextResponse.json({ error: "Ordem cancelada" }, { status: 400 });

  const etapas = await prisma.itemOrdemProducao.findMany({
    where: { ordemProducaoId: params.id },
    select: { id: true, status: true, estadoSaida: true, sequencia: true, nome: true, subprodutoItemId: true },
    orderBy: { sequencia: "asc" },
  });
  const pendentes = etapas.filter((e) => e.status !== "CONCLUIDA");
  if (pendentes.length === 0) {
    return NextResponse.json({ error: "Todas as etapas já estão concluídas." }, { status: 400 });
  }

  // Onde aplicar biomassa (etapa de queima) e perda (última etapa do fluxo).
  const etapaQueima = [...pendentes].reverse().find((e) => e.estadoSaida === "QUEIMADO");
  const ultima = pendentes[pendentes.length - 1];
  const agora = new Date();

  await prisma.$transaction(async (tx) => {
    for (const etapa of pendentes) {
      const upd: Prisma.ItemOrdemProducaoUpdateInput = {
        status: "CONCLUIDA",
        qtdEntrada: quantidadeProduzida,
        qtdSaida: quantidadeProduzida,
        inicioReal: agora,
        fimReal: agora,
        ...(apontadoPor ? { apontadoPor } : {}),
        ...(qtdPerda != null && etapa.id === ultima.id ? { qtdPerda } : {}),
      };
      await apontarEtapaProducao(tx, {
        ordemId: params.id,
        etapa,
        upd,
        concluindoAgora: true,
        qtdEntradaNum: quantidadeProduzida,
        qtdSaidaNum: quantidadeProduzida,
        biomassaKg: etapaQueima && etapa.id === etapaQueima.id ? biomassaKg : null,
        biomassaDescricao: null,
        milheiros: quantidadeProduzida,
        subprodutoQtd: null,
        apontadoPor,
      });
    }
  }, { timeout: 30000 });

  // Contabiliza a produção (D Estoque / C Custo via PEP) ao concluir. Best-effort.
  await contabilizarProducaoOrdem(params.id).catch(() => {});

  return NextResponse.json({ ok: true, etapasConcluidas: pendentes.length });
}
