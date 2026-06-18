export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma, empresasDoEscopo } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { registrarLancamento, PeriodoFechadoError } from "@/lib/contabilidade";

// GET /api/contabilidade/lancamentos?limit=100
// Diário contábil da empresa ativa (escopo do prisma).
export async function GET(req: NextRequest) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);

  const data = await prisma.lancamentoContabil.findMany({
    orderBy: [{ data: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true, data: true, historico: true, origemTipo: true, origemId: true, criadoPor: true, estornoDeId: true,
      partidas: {
        select: {
          id: true, tipo: true, valor: true,
          conta: { select: { codigo: true, nome: true } },
        },
      },
    },
  });

  return NextResponse.json({ data });
}

// POST → lançamento contábil MANUAL (partidas dobradas), registrando o usuário.
// Body: { data: "YYYY-MM-DD", historico, partidas: [{ contaId, tipo, valor }] }
export async function POST(req: NextRequest) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null) as {
    data?: string; historico?: string;
    partidas?: { contaId: string; tipo: "DEBITO" | "CREDITO"; valor: number | string }[];
  } | null;
  if (!body?.historico?.trim()) return NextResponse.json({ error: "Informe o histórico" }, { status: 400 });
  const partidas = (body.partidas ?? [])
    .map((p) => ({ contaId: p.contaId, tipo: p.tipo, valor: Number(p.valor) }))
    .filter((p) => p.contaId && p.valor > 0);
  if (partidas.length < 2) return NextResponse.json({ error: "Informe ao menos um débito e um crédito" }, { status: 400 });

  // Só contas analíticas (aceitam lançamento).
  const [empresaId] = await empresasDoEscopo();
  const contas = await prisma.contaContabil.findMany({
    where: { id: { in: partidas.map((p) => p.contaId) } },
    select: { id: true, aceitaLancamento: true },
  });
  const okIds = new Set(contas.filter((c) => c.aceitaLancamento).map((c) => c.id));
  if (partidas.some((p) => !okIds.has(p.contaId))) {
    return NextResponse.json({ error: "Todas as contas devem ser analíticas (que aceitam lançamento)" }, { status: 400 });
  }

  const data = body.data ? new Date(body.data + "T12:00:00") : new Date();
  try {
    const lanc = await registrarLancamento({
      empresaId, data, historico: body.historico.trim(),
      origemTipo: "MANUAL", criadoPor: auth.session.nome,
      partidas,
    });
    return NextResponse.json({ data: lanc });
  } catch (e) {
    if (e instanceof PeriodoFechadoError) return NextResponse.json({ error: e.message }, { status: 400 });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
