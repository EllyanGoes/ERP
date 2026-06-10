export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q              = searchParams.get("q") || "";
  const ativoParam     = searchParams.get("ativo");
  const vendavelParam  = searchParams.get("vendavel");
  const tipoProdutoId  = searchParams.get("tipoProdutoId") || undefined;

  const ativoFilter    = ativoParam    === "true" ? true : ativoParam    === "false" ? false : undefined;
  const vendavelFilter = vendavelParam === "true" ? true : vendavelParam === "false" ? false : undefined;

  const andClauses: object[] = [];
  if (ativoFilter    !== undefined) andClauses.push({ ativo:    ativoFilter });
  if (vendavelFilter !== undefined) andClauses.push({ vendavel: vendavelFilter });
  if (tipoProdutoId) andClauses.push({ tipoProdutoId });
  if (q) {
    andClauses.push({
      OR: [
        { codigo:    { contains: q, mode: "insensitive" as const } },
        { descricao: { contains: q, mode: "insensitive" as const } },
      ],
    });
  }

  const where = andClauses.length === 0 ? {} : andClauses.length === 1 ? andClauses[0] : { AND: andClauses };

  const data = await prisma.item.findMany({
    where,
    include: {
      tipoProduto: { select: { nome: true } },
      unidade: { select: { sigla: true, nome: true } },
      estoqueItems: {
        include: { localEstoque: { select: { nome: true } } },
      },
    },
    orderBy: { codigo: "asc" },
  });

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.descricao?.trim()) {
      return NextResponse.json({ error: "Descrição é obrigatória" }, { status: 400 });
    }

    const item = await prisma.$transaction(async (tx) => {
      // ── Auto-generate sequential product code: PROD-0001, PROD-0002 … ─────────
      const seq = await tx.sequencia.upsert({
        where:  { empresaId_prefixo: { empresaId: EMPRESA_PADRAO_ID, prefixo: "PROD" } },
        create: { prefixo: "PROD", ultimo: 1 },
        update: { ultimo: { increment: 1 } },
      });
      const codigo = `PROD-${String(seq.ultimo).padStart(4, "0")}`;

      const newItem = await tx.item.create({
        data: {
          codigo,
          descricao: body.descricao.trim(),
          tipo: body.tipo ?? "PRODUTO",
          unidadeId: body.unidadeId || null,
          tipoProdutoId: body.tipoProdutoId || null,
          ncm: body.ncm?.trim() || null,
          precoVenda: parseFloat(body.precoVenda) || 0,
          vendavel: body.vendavel === true,
          comodato: body.comodato === true,
        },
      });

      // Auto-create principal ItemUnidade for the base unit (upsert = safe to retry)
      if (body.unidadeId) {
        await tx.itemUnidade.upsert({
          where:  { itemId_unidadeId: { itemId: newItem.id, unidadeId: body.unidadeId } },
          create: { itemId: newItem.id, unidadeId: body.unidadeId, isPrincipal: true, fatorConversao: null, baseUnidadeId: null },
          update: { isPrincipal: true },
        });
      }

      // estoqueItems are created on demand when the first stock movement
      // is registered for a specific location — no "sem local" placeholder needed.

      return newItem;
    });

    return NextResponse.json({ data: item }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno ao criar produto";
    console.error("[POST /api/suprimentos/produtos]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
