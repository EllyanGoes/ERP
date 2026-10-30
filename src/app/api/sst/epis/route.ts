export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { salvarTamanhosEpi, conflitoItemEpi } from "@/lib/sst-epi";

// GET /api/sst/epis — EPIs da empresa ativa com os tamanhos (item de estoque +
// saldo físico próprio somado entre locais) e nº de entregas/funções.
export async function GET() {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const epis = await prisma.sstEpi.findMany({
    orderBy: { nome: "asc" },
    include: {
      item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } },
      itens: { orderBy: [{ ordem: "asc" }, { tamanho: "asc" }], select: { itemId: true, tamanho: true, item: { select: { id: true, codigo: true, descricao: true, unidadeMedida: true } } } },
      _count: { select: { entregas: true, requisitos: true } },
    },
  });
  const itemIds = Array.from(new Set(epis.flatMap((e) => e.itens.map((i) => i.itemId))));
  const saldos = itemIds.length
    ? await prisma.estoqueItem.groupBy({ by: ["itemId"], where: { itemId: { in: itemIds }, clienteDonoId: null }, _sum: { quantidadeAtual: true } })
    : [];
  const porItem = new Map(saldos.map((s) => [s.itemId, Number(s._sum.quantidadeAtual ?? 0)]));
  const data = epis.map((e) => {
    const itens = e.itens.map((i) => ({ ...i, saldo: porItem.get(i.itemId) ?? 0 }));
    return { ...e, itens, saldoEstoque: itens.length ? itens.reduce((s, i) => s + i.saldo, 0) : null };
  });
  return NextResponse.json({ data });
}

// POST /api/sst/epis { nome, ca?, caValidade?, vidaUtilDias?, fabricante?, descartavel?, itens?: [{ itemId, tamanho }] | itemId? }
export async function POST(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const nome = String(b.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "Informe o nome do EPI." }, { status: 400 });
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const linhas: { itemId?: string | null; tamanho?: string | null }[] = Array.isArray(b.itens) ? b.itens : b.itemId ? [{ itemId: b.itemId }] : [];
  const conflito = await conflitoItemEpi(prismaSemEscopo, { empresaId, itemIds: linhas.map((l) => String(l.itemId ?? "")) });
  if (conflito) return NextResponse.json({ error: conflito }, { status: 409 });
  const epi = await prisma.sstEpi.create({
    data: {
      empresaId,
      nome, ca: b.ca?.trim() || null, caValidade: b.caValidade ? new Date(b.caValidade) : null,
      vidaUtilDias: b.vidaUtilDias ? Number(b.vidaUtilDias) : null, fabricante: b.fabricante?.trim() || null,
      descartavel: !!b.descartavel,
    },
  });
  if (linhas.length) await prismaSemEscopo.$transaction((tx) => salvarTamanhosEpi(tx, epi.id, linhas));
  return NextResponse.json({ data: epi }, { status: 201 });
}
