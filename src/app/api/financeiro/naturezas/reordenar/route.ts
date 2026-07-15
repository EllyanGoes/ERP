export const dynamic = "force-dynamic";
// Persiste a ordem manual (drag and drop) das naturezas e/ou subgrupos.
// Recebe a lista completa do bucket reordenado ({id, ordem} sequencial); o
// prisma escopado garante que só linhas da empresa ativa são atualizadas.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { z } from "zod";

const item = z.object({ id: z.string().min(1), ordem: z.number().int().min(0) });
const schema = z.object({
  naturezas: z.array(item).max(500).optional(),
  subgrupos: z.array(item).max(500).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const { naturezas = [], subgrupos = [] } = parsed.data;
  if (naturezas.length === 0 && subgrupos.length === 0) {
    return NextResponse.json({ error: "Nada para reordenar" }, { status: 400 });
  }

  await prisma.$transaction([
    ...naturezas.map((n) =>
      prisma.naturezaFinanceira.updateMany({ where: { id: n.id }, data: { ordem: n.ordem } })),
    ...subgrupos.map((s) =>
      prisma.naturezaSubgrupo.updateMany({ where: { id: s.id }, data: { ordem: s.ordem } })),
  ]);

  return NextResponse.json({ data: { ok: true } });
}
