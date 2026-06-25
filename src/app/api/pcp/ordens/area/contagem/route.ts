export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// GET /api/pcp/ordens/area/contagem?fluxoId=&data=YYYY-MM-DD
// Contagem de OPs por área (nodeId) no dia: abertas (pendentes/em execução) e
// concluídas. Usado nas abas do board no lugar do estado de WIP.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const sp = new URL(req.url).searchParams;
  const fluxoId = sp.get("fluxoId") ?? "";
  const data = sp.get("data") ?? new Date().toISOString().slice(0, 10);
  if (!fluxoId) return NextResponse.json({ data: {} });

  const ini = new Date(`${data}T00:00:00.000Z`);
  const fim = new Date(`${data}T23:59:59.999Z`);
  if (isNaN(ini.getTime())) return NextResponse.json({ data: {} });

  const ordens = await prisma.ordemProducao.findMany({
    where: { status: { not: "CANCELADA" }, createdAt: { gte: ini, lte: fim }, fluxoVersao: { fluxoProducaoId: fluxoId } },
    select: { etapas: { select: { nodeId: true, status: true }, orderBy: { sequencia: "asc" }, take: 1 } },
  });

  const contagem: Record<string, { abertas: number; concluidas: number }> = {};
  for (const o of ordens) {
    const e = o.etapas[0];
    if (!e?.nodeId) continue;
    const c = (contagem[e.nodeId] ??= { abertas: 0, concluidas: 0 });
    if (e.status === "CONCLUIDA") c.concluidas += 1;
    else c.abertas += 1;
  }

  return NextResponse.json({ data: contagem });
}
