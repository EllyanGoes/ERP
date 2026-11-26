export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { SITUACOES_ABERTAS } from "@/lib/processos";
import { consultarDatajud } from "@/lib/processos-datajud";

/**
 * Cron diário: captura os andamentos dos processos judiciais com "Acompanhar automaticamente
 * (DataJud)" ligado (docs/processos-prd.md, Fase 1.5). Os mais antigos de consulta vão primeiro;
 * para no limite de tempo da função e o resto fica para a próxima rodada. Andamento novo ALTA →
 * uma notificação por processo (sino + Telegram) ao responsável. Protegido por CRON_SECRET.
 */
const ORCAMENTO_MS = 50_000; // folga sob o maxDuration de 60 s
const PAUSA_MS = 1_500; // gentileza com a API pública
const MAX_POR_RODADA = 40;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const inicio = Date.now();
  const processos = await prismaSemEscopo.processo.findMany({
    where: { datajudAtivo: true, situacao: { in: SITUACOES_ABERTAS } },
    orderBy: [{ datajudUltimaConsulta: { sort: "asc", nulls: "first" } }],
    take: MAX_POR_RODADA,
    select: { id: true, codigo: true },
  });
  const resultado: { codigo: string; novos: number; importantes: number; erro?: string }[] = [];
  for (const p of processos) {
    if (Date.now() - inicio > ORCAMENTO_MS) break;
    const r = await consultarDatajud(p.id, { notificar: true });
    resultado.push({ codigo: p.codigo, novos: r.novos, importantes: r.importantes, ...(r.erro ? { erro: r.erro } : {}) });
    await new Promise((ok) => setTimeout(ok, PAUSA_MS));
  }
  return NextResponse.json({ ok: true, elegiveis: processos.length, consultados: resultado.length, resultado });
}
