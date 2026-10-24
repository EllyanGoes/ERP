export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { resolverVinculoAtivo, ErroAtivo } from "@/lib/manutencao/ativo";

const INCLUDE = {
  setor: { select: { id: true, nome: true } },
  protecoes: { select: { id: true, conforme: true } },
  ativo: { select: { id: true, codApl: true, tag: true, nome: true } },
};

// GET /api/sst/maquinas — inventário NR-12 da empresa ativa.
export async function GET() {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const data = await prisma.sstMaquina.findMany({ orderBy: [{ status: "asc" }, { nome: "asc" }], include: INCLUDE });
  return NextResponse.json({ data });
}

// POST { nome, local?, setorId?, ativoId?, fabricante?, anoFabricacao?, status?, observacoes? } | { lote: [{nome, local?, ativoId?}] }
// O vínculo com a Manutenção é o ativoId (FK); codApl é gravado junto, sincronizado
// do ativo, por compatibilidade. `codApl` no corpo ainda é aceito (legado) e resolvido.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const STATUS = ["NAO_AVALIADA", "NAO_CONFORME", "EM_ADEQUACAO", "CONFORME", "INTERDITADA", "DESATIVADA"];
  const lote: { nome: string; local?: string | null; ativoId?: string | null; codApl?: number | null }[] = Array.isArray(b.lote) ? b.lote.filter((m: { nome?: string }) => m?.nome?.trim()) : [];
  if (lote.length > 0) {
    // Vincular ativos da Manutenção: resolve cada item no ativo (por id, ou
    // codApl legado) e pula ativo que já tem máquina nesta empresa.
    const ids = lote.map((m) => m.ativoId).filter((v): v is string => !!v);
    const cods = lote.map((m) => Number(m.codApl)).filter((n) => Number.isInteger(n) && n > 0);
    const [ativos, existentes] = await Promise.all([
      ids.length || cods.length
        ? prisma.manutAtivo.findMany({ where: { OR: [{ id: { in: ids } }, { codApl: { in: cods } }] }, select: { id: true, codApl: true } })
        : Promise.resolve([]),
      prisma.sstMaquina.findMany({ where: { ativoId: { not: null } }, select: { ativoId: true } }),
    ]);
    const porId = new Map(ativos.map((a) => [a.id, a]));
    const porCod = new Map(ativos.map((a) => [a.codApl, a]));
    const ja = new Set(existentes.map((m) => m.ativoId));
    const novas = lote
      .map((m) => ({ m, a: (m.ativoId ? porId.get(m.ativoId) : undefined) ?? (m.codApl ? porCod.get(Number(m.codApl)) : undefined) }))
      .filter(({ a }) => !a || !ja.has(a.id));
    await prisma.sstMaquina.createMany({ data: novas.map(({ m, a }) => ({ empresaId, nome: m.nome.trim(), local: m.local?.trim() || null, ativoId: a?.id ?? null, codApl: a?.codApl ?? null, criadoPor: auth.session.nome })) });
    return NextResponse.json({ data: { criadas: novas.length, puladas: lote.length - novas.length } }, { status: 201 });
  }
  const nome = String(b.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "Informe o nome da máquina." }, { status: 400 });
  let vinculo;
  try {
    vinculo = await resolverVinculoAtivo(b);
  } catch (e) {
    if (e instanceof ErroAtivo) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const m = await prisma.sstMaquina.create({
    data: {
      empresaId, nome, local: b.local?.trim() || null, setorId: b.setorId || null,
      ativoId: vinculo?.ativoId ?? null, codApl: vinculo?.codApl ?? null,
      fabricante: b.fabricante?.trim() || null, anoFabricacao: b.anoFabricacao ? Number(b.anoFabricacao) : null,
      status: STATUS.includes(b.status) ? b.status : "NAO_AVALIADA", observacoes: b.observacoes?.trim() || null,
    },
    include: INCLUDE,
  });
  return NextResponse.json({ data: m }, { status: 201 });
}
