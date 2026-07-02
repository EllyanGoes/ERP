export const dynamic = "force-dynamic";
export const maxDuration = 300;
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { executarBackfillConsistencia } from "@/lib/backfill-consistencia";

// Progresso persistido em Configuracao (mesmo padrão do reprocesso de vendas):
// a barra sobrevive a trocar de aba e o heartbeat evita trava presa após crash.
const PROGRESSO_KEY = "consistencia:progresso";
const ULTIMA_KEY = "consistencia:ultimaExecucao";
const HEARTBEAT_MS = 90_000;

type Progresso = { running: boolean; pct: number; fase: string; heartbeat: number };

async function lerProgresso(): Promise<Progresso | null> {
  const row = await prismaSemEscopo.configuracao.findUnique({ where: { chave: PROGRESSO_KEY } });
  if (!row?.valor) return null;
  try { return JSON.parse(row.valor) as Progresso; } catch { return null; }
}
function estaRodando(p: Progresso | null): boolean {
  return !!(p?.running && p.heartbeat && Date.now() - p.heartbeat < HEARTBEAT_MS);
}
async function gravarProgresso(p: Progresso) {
  const valor = JSON.stringify(p);
  try {
    await prismaSemEscopo.configuracao.upsert({
      where: { chave: PROGRESSO_KEY },
      create: { chave: PROGRESSO_KEY, valor },
      update: { valor },
    });
  } catch { /* best-effort */ }
}
async function registrarUltimaExecucao(payload: Record<string, unknown>) {
  const valor = JSON.stringify({ at: new Date().toISOString(), ...payload });
  try {
    await prismaSemEscopo.configuracao.upsert({
      where: { chave: ULTIMA_KEY },
      create: { chave: ULTIMA_KEY, valor },
      update: { valor },
    });
  } catch { /* best-effort */ }
}

/** GET — status: `{ running, progresso, ultima }` (reconstrói a barra em qualquer aba). */
export async function GET() {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;
  const p = await lerProgresso();
  const running = estaRodando(p);
  const progresso = running && p ? { pct: p.pct, fase: p.fase } : null;
  let ultima: Record<string, unknown> | null = null;
  const row = await prismaSemEscopo.configuracao.findUnique({ where: { chave: ULTIMA_KEY } });
  if (row?.valor) { try { ultima = JSON.parse(row.valor); } catch { /* ignore */ } }
  return NextResponse.json({ running, progresso, ultima });
}

/**
 * POST — backfill de consistência (motor idempotente; ver src/lib/backfill-consistencia.ts).
 * `?dry=1` responde JSON direto (só dimensiona). Execução real responde em STREAM
 * (SSE): `{ pct, fase }` por item e `{ done, log, erros }` no fim. Só ADMIN.
 */
export async function POST(req: NextRequest) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;
  if (auth.session.perfil !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });
  }

  if (req.nextUrl.searchParams.get("dry") === "1") {
    const resultado = await executarBackfillConsistencia({ dry: true });
    return NextResponse.json({ data: { dry: true, ...resultado } });
  }

  // Guarda contra execução concorrente (duplo clique / outra aba).
  if (estaRodando(await lerProgresso())) {
    return NextResponse.json({ error: "Já há um backfill de consistência em execução. Aguarde ele terminar." }, { status: 409 });
  }
  await gravarProgresso({ running: true, pct: 0, fase: "Iniciando", heartbeat: Date.now() });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* stream fechado */ }
      };
      // Persistência com throttle (~1,5s, fire-and-forget); o stream é a cada tick.
      let ultimoTickAt = 0;
      const onProgress = (pct: number, fase: string) => {
        send({ pct, fase });
        const agora = Date.now();
        if (agora - ultimoTickAt < 1500) return;
        ultimoTickAt = agora;
        void gravarProgresso({ running: true, pct, fase, heartbeat: agora });
      };
      try {
        const resultado = await executarBackfillConsistencia({ onProgress });
        await gravarProgresso({ running: false, pct: 100, fase: "Concluído", heartbeat: Date.now() });
        await registrarUltimaExecucao({ ok: true, erros: resultado.erros.length });
        send({ done: true, log: resultado.log, erros: resultado.erros });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erro no backfill";
        await gravarProgresso({ running: false, pct: 0, fase: "Falhou", heartbeat: Date.now() });
        await registrarUltimaExecucao({ ok: false, error: msg });
        send({ done: true, error: msg });
      } finally {
        try { controller.close(); } catch { /* já fechado */ }
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
