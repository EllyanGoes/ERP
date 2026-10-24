export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { montarMapa } from "@/lib/manutencao/mapa";

// GET /api/pcm/mapa — ativos da empresa ativa com status derivado + posições do
// mapa da planta (lib/manutencao/mapa.ts).
export async function GET() {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  return NextResponse.json({ data: await montarMapa(empresaId) });
}

// Lê um número em % do canvas (0–100) ou null para "limpar"; undefined = não veio.
function lerPct(v: unknown, max = 100): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(0, Math.round(n * 100) / 100));
}

// PATCH /api/pcm/mapa — salva posição/tamanho de um bloco (ou de vários, com
// `itens: [{id, mapaX, …}]`). null em todos os campos = volta ao layout automático.
export async function PATCH(req: NextRequest) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });

  const itens: unknown[] = Array.isArray(body.itens) ? body.itens : [body];
  const atualizacoes: { id: string; data: { mapaX?: number | null; mapaY?: number | null; mapaLargura?: number | null; mapaAltura?: number | null } }[] = [];
  for (const raw of itens) {
    const it = raw as Record<string, unknown>;
    if (typeof it?.id !== "string" || !it.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    const data: (typeof atualizacoes)[number]["data"] = {};
    const x = lerPct(it.mapaX), y = lerPct(it.mapaY), w = lerPct(it.mapaLargura), h = lerPct(it.mapaAltura);
    if (x !== undefined) data.mapaX = x;
    if (y !== undefined) data.mapaY = y;
    if (w !== undefined) data.mapaLargura = w;
    if (h !== undefined) data.mapaAltura = h;
    if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nada para salvar" }, { status: 400 });
    atualizacoes.push({ id: it.id, data });
  }

  // Só ativos da empresa ativa (o proxy escopa o findMany; o update é por id).
  const ids = atualizacoes.map((a) => a.id);
  const existentes = new Set((await prisma.manutAtivo.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((a) => a.id));
  const faltando = ids.filter((id) => !existentes.has(id));
  if (faltando.length) return NextResponse.json({ error: "Ativo não encontrado" }, { status: 404 });

  await prisma.$transaction(atualizacoes.map((a) => prisma.manutAtivo.update({ where: { id: a.id }, data: a.data })));
  return NextResponse.json({ data: { atualizados: atualizacoes.length } });
}
