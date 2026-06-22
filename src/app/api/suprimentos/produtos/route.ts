export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo, empresasDoEscopo } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { EMPRESA_PADRAO_ID, proximaSequenciaDaEmpresa } from "@/lib/empresa";
import { custosPorEmpresaItem, chaveCustoEmpresa } from "@/lib/custo-empresa";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q              = searchParams.get("q") || "";
  const ativoParam     = searchParams.get("ativo");
  const vendavelParam  = searchParams.get("vendavel");
  const tipoProdutoId  = searchParams.get("tipoProdutoId") || undefined;
  const categoria      = searchParams.get("categoria") || undefined;

  const ativoFilter    = ativoParam    === "true" ? true : ativoParam    === "false" ? false : undefined;
  const vendavelFilter = vendavelParam === "true" ? true : vendavelParam === "false" ? false : undefined;

  const andClauses: object[] = [];
  if (ativoFilter    !== undefined) andClauses.push({ ativo:    ativoFilter });
  if (vendavelFilter !== undefined) andClauses.push({ vendavel: vendavelFilter });
  if (tipoProdutoId) andClauses.push({ tipoProdutoId });
  if (categoria) andClauses.push({ categoriaEstoque: categoria as never });
  if (q) {
    andClauses.push({
      OR: [
        { codigo:    { contains: q, mode: "insensitive" as const } },
        { descricao: { contains: q, mode: "insensitive" as const } },
      ],
    });
  }

  const where = andClauses.length === 0 ? {} : andClauses.length === 1 ? andClauses[0] : { AND: andClauses };

  // O produto é cadastro compartilhado: o include aninhado de estoque não
  // passa pela extensão de escopo — filtra à mão pelas empresas visíveis
  // (empresa ativa do seletor, ou todas no modo grupo).
  const visiveis = await empresasDoEscopo();
  const data = await prisma.item.findMany({
    where,
    include: {
      tipoProduto: { select: { nome: true } },
      unidade: { select: { sigla: true, nome: true } },
      estoqueItems: {
        where: { empresaId: { in: visiveis } },
        include: { localEstoque: { select: { nome: true } } },
      },
    },
    orderBy: { codigo: "asc" },
  });

  // Custo por empresa: a lista mostra o CMPM da empresa ativa da sessão
  // (fallback no CMPM global do Item, que já vem no registro).
  const session = await getSession();
  const empresaAtiva = session?.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const custosEmp = await custosPorEmpresaItem(
    prisma,
    data.map((i) => ({ empresaId: empresaAtiva, itemId: i.id })),
  );
  const comCusto = data.map((i) => {
    const proprio = custosEmp.get(chaveCustoEmpresa(empresaAtiva, i.id));
    // Estrito por empresa: sem custo próprio → sem custo (não herda o global).
    return { ...i, precoCusto: proprio != null ? proprio : null };
  });

  return NextResponse.json({ data: comCusto });
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();

    if (!body.descricao?.trim()) {
      return NextResponse.json({ error: "Descrição é obrigatória" }, { status: 400 });
    }

    // ── Auto-generate sequential product code: PROD-0001, PROD-0002 … ─────────
    // O produto é cadastro COMPARTILHADO (codigo único global), então a
    // sequência é a global (client cru) — pela `prisma` escopada, a extensão
    // reescreveria para a empresa ativa e cada empresa recomeçaria do PROD-0001,
    // colidindo no unique. Pula códigos já usados (sequências antigas podem
    // estar atrás do maior código existente).
    let codigo = "";
    for (let i = 0; i < 50; i++) {
      const n = await proximaSequenciaDaEmpresa(EMPRESA_PADRAO_ID, "PROD");
      const candidato = `PROD-${String(n).padStart(4, "0")}`;
      const existe = await prismaSemEscopo.item.findUnique({ where: { codigo: candidato }, select: { id: true } });
      if (!existe) { codigo = candidato; break; }
    }
    if (!codigo) {
      return NextResponse.json({ error: "Não foi possível gerar o código do produto — verifique a sequência PROD." }, { status: 500 });
    }

    const item = await prisma.$transaction(async (tx) => {
      const newItem = await tx.item.create({
        data: {
          codigo,
          descricao: body.descricao.trim(),
          tipo: body.tipo ?? "PRODUTO",
          unidadeId: body.unidadeId || null,
          tipoProdutoId: body.tipoProdutoId || null,
          categoriaEstoque: body.categoriaEstoque || null,
          ncm: body.ncm?.trim() || null,
          precoVenda: parseFloat(body.precoVenda) || 0,
          vendavel: body.vendavel === true,
          comodato: body.comodato === true,
          consumivel: body.consumivel !== false,
          estadosWip: Array.isArray(body.estadosWip) ? body.estadosWip.filter((s: unknown) => typeof s === "string") : [],
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
