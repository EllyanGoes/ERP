export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, EMPRESA_PADRAO_ID } from "@/lib/prisma";

// GET /api/sst/epis — EPIs da empresa ativa (com item de estoque, saldo físico
// próprio somado entre locais e nº de entregas vigentes).
export async function GET() {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const epis = await prisma.sstEpi.findMany({
    orderBy: { nome: "asc" },
    include: { item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } }, _count: { select: { entregas: true, requisitos: true } } },
  });
  const itemIds = Array.from(new Set(epis.map((e) => e.itemId).filter((x): x is string => !!x)));
  const saldos = itemIds.length
    ? await prisma.estoqueItem.groupBy({ by: ["itemId"], where: { itemId: { in: itemIds }, clienteDonoId: null }, _sum: { quantidadeAtual: true } })
    : [];
  const porItem = new Map(saldos.map((s) => [s.itemId, Number(s._sum.quantidadeAtual ?? 0)]));
  const data = epis.map((e) => ({ ...e, saldoEstoque: e.itemId ? porItem.get(e.itemId) ?? 0 : null }));
  return NextResponse.json({ data });
}

// POST /api/sst/epis { nome, ca?, caValidade?, vidaUtilDias?, fabricante?, itemId? }
export async function POST(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const nome = String(b.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "Informe o nome do EPI." }, { status: 400 });
  const epi = await prisma.sstEpi.create({
    data: {
      empresaId: auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID,
      nome, ca: b.ca?.trim() || null, caValidade: b.caValidade ? new Date(b.caValidade) : null,
      vidaUtilDias: b.vidaUtilDias ? Number(b.vidaUtilDias) : null, fabricante: b.fabricante?.trim() || null,
      itemId: b.itemId || null,
    },
  });
  return NextResponse.json({ data: epi }, { status: 201 });
}
