export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// GET /api/pcp/ordens/dias-producao?fluxoId=&ano=YYYY&mes=M (1-12)
// Dias do mês que TIVERAM produção no fluxo = ≥1 etapa de OP apontada/concluída
// (status CONCLUIDA, por fimReal). Usado pelo calendário do board (check verde).
export async function GET(req: NextRequest) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const sp = new URL(req.url).searchParams;
  const fluxoId = sp.get("fluxoId") ?? "";
  const ano = parseInt(sp.get("ano") ?? "", 10);
  const mes = parseInt(sp.get("mes") ?? "", 10); // 1-12
  if (!fluxoId || !Number.isFinite(ano) || !Number.isFinite(mes) || mes < 1 || mes > 12) return NextResponse.json({ dias: [] });

  const ini = new Date(Date.UTC(ano, mes - 1, 1, 0, 0, 0, 0));
  const fim = new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999)); // último dia do mês

  const etapas = await prisma.itemOrdemProducao.findMany({
    where: {
      status: "CONCLUIDA",
      fimReal: { gte: ini, lte: fim },
      ordemProducao: { fluxoVersao: { fluxoProducaoId: fluxoId } },
    },
    select: { fimReal: true },
  });

  const dias = Array.from(new Set(etapas.map((e) => e.fimReal!.toISOString().slice(0, 10)))).sort();
  return NextResponse.json({ dias });
}
