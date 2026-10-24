export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import type { TipoCentroTrabalho } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolverVinculoAtivo, ErroAtivo } from "@/lib/manutencao/ativo";

// Ativo da Manutenção ligado (forno/secador) — relação `ativoManut` porque o
// CentroTrabalho já tem o boolean `ativo`.
const INCLUDE = { ativoManut: { select: { id: true, codApl: true, tag: true, nome: true } } } as const;

const TIPOS: TipoCentroTrabalho[] = [
  "PREPARACAO", "CONFORMACAO", "SECAGEM", "FORNO", "EMBALAGEM", "TRANSPORTE", "OUTRO",
];

function parseTipo(v: unknown): TipoCentroTrabalho | null {
  return typeof v === "string" && (TIPOS as string[]).includes(v) ? (v as TipoCentroTrabalho) : null;
}
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// GET — lista de centros de trabalho
export async function GET() {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const data = await prisma.centroTrabalho.findMany({ orderBy: [{ ativo: "desc" }, { nome: "asc" }], include: INCLUDE });
  return NextResponse.json({ data, source: "db" });
}

// POST — cria um centro de trabalho. Vínculo com a Manutenção por `ativoId`
// (codApl gravado junto, sincronizado do ativo; `codApl` no corpo é legado).
export async function POST(req: NextRequest) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  const codigo = typeof body.codigo === "string" ? body.codigo.trim() : "";
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  if (!codigo || !nome) {
    return NextResponse.json({ error: "Código e nome são obrigatórios" }, { status: 400 });
  }
  let vinculo;
  try {
    vinculo = await resolverVinculoAtivo(body);
  } catch (e) {
    if (e instanceof ErroAtivo) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  try {
    const data = await prisma.centroTrabalho.create({
      data: {
        codigo,
        nome,
        tipo: parseTipo(body.tipo),
        ativoId: vinculo?.ativoId ?? null,
        codApl: vinculo?.codApl ?? null,
        capacidadePadrao: numOrNull(body.capacidadePadrao),
        unidadeCapacidade: typeof body.unidadeCapacidade === "string" ? body.unidadeCapacidade.trim() || null : null,
        observacao: typeof body.observacao === "string" ? body.observacao.trim() || null : null,
        ativo: body.ativo === undefined ? true : body.ativo !== false,
      },
      include: INCLUDE,
    });
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Não foi possível criar (código já existe?)." }, { status: 400 });
  }
}
