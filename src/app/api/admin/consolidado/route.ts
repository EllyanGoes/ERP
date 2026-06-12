export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { custosPorEmpresaItem, chaveCustoEmpresa } from "@/lib/custo-empresa";

// ─────────────────────────────────────────────────────────────────────────────
// Consolidado do grupo (multiempresa — Fase 5). Restrito a ADMIN.
//
// Soma as empresas ativas e ELIMINA as operações intragrupo do total do grupo
// (a venda da Tramontin para a Atalaia e a compra/conta espelhadas se anulam —
// contá-las dobraria receita e despesa). Usa o client SEM escopo: este é o
// único lugar que enxerga todas as empresas de uma vez.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_VENDA_VALIDA = { notIn: ["ORCAMENTO", "CANCELADO"] as never };
const STATUS_CONTA_ABERTA = { in: ["ABERTA", "PARCIAL", "VENCIDA"] as never };

type Metrica = { total: number; intragrupo: number; quantidade: number };

function metricaVazia(): Metrica {
  return { total: 0, intragrupo: 0, quantidade: 0 };
}

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (auth.session.perfil !== "ADMIN") {
    return NextResponse.json({ error: "Restrito a administradores do grupo" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const hoje = new Date();
  const de = searchParams.get("de")
    ? new Date(`${searchParams.get("de")}T00:00:00.000Z`)
    : new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), 1));
  const ate = searchParams.get("ate")
    ? new Date(`${searchParams.get("ate")}T23:59:59.999Z`)
    : hoje;

  const empresas = await prismaSemEscopo.empresa.findMany({
    where: { ativo: true },
    select: { id: true, razaoSocial: true, nomeFantasia: true, slug: true },
    orderBy: { createdAt: "asc" },
  });

  const [vendas, compras, receber, pagar, estoque] = await Promise.all([
    prismaSemEscopo.pedidoVenda.groupBy({
      by: ["empresaId", "intragrupo"],
      where: { dataEmissao: { gte: de, lte: ate }, status: STATUS_VENDA_VALIDA },
      _sum: { valorTotal: true },
      _count: { _all: true },
    }),
    prismaSemEscopo.pedidoCompra.groupBy({
      by: ["empresaId", "intragrupo"],
      where: { createdAt: { gte: de, lte: ate }, status: { not: "CANCELADO" } },
      _sum: { valorTotal: true },
      _count: { _all: true },
    }),
    prismaSemEscopo.contaReceber.groupBy({
      by: ["empresaId", "intragrupo"],
      where: { status: STATUS_CONTA_ABERTA },
      _sum: { valorOriginal: true, valorPago: true },
      _count: { _all: true },
    }),
    prismaSemEscopo.contaPagar.groupBy({
      by: ["empresaId", "intragrupo"],
      where: { status: STATUS_CONTA_ABERTA },
      _sum: { valorOriginal: true, valorPago: true },
      _count: { _all: true },
    }),
    prismaSemEscopo.estoqueItem.findMany({
      where: { clienteDonoId: null }, // estoque de terceiros não entra na valoração
      select: {
        empresaId: true,
        itemId: true,
        quantidadeAtual: true,
        item: { select: { precoCusto: true } },
      },
    }),
  ]);

  type Linha = {
    id: string;
    nome: string;
    slug: string | null;
    vendas: Metrica;
    compras: Metrica;
    receberAberto: Metrica;
    pagarAberto: Metrica;
    estoqueValor: number;
  };

  const porEmpresa = new Map<string, Linha>(
    empresas.map((e) => [
      e.id,
      {
        id: e.id,
        nome: e.nomeFantasia ?? e.razaoSocial,
        slug: e.slug,
        vendas: metricaVazia(),
        compras: metricaVazia(),
        receberAberto: metricaVazia(),
        pagarAberto: metricaVazia(),
        estoqueValor: 0,
      },
    ])
  );

  const num = (v: unknown) => (v == null ? 0 : parseFloat(String(v)));

  for (const g of vendas) {
    const linha = porEmpresa.get(g.empresaId);
    if (!linha) continue;
    const valor = num(g._sum.valorTotal);
    linha.vendas.total += valor;
    linha.vendas.quantidade += g._count._all;
    if (g.intragrupo) linha.vendas.intragrupo += valor;
  }
  for (const g of compras) {
    const linha = porEmpresa.get(g.empresaId);
    if (!linha) continue;
    const valor = num(g._sum.valorTotal);
    linha.compras.total += valor;
    linha.compras.quantidade += g._count._all;
    if (g.intragrupo) linha.compras.intragrupo += valor;
  }
  for (const g of receber) {
    const linha = porEmpresa.get(g.empresaId);
    if (!linha) continue;
    const valor = num(g._sum.valorOriginal) - num(g._sum.valorPago);
    linha.receberAberto.total += valor;
    linha.receberAberto.quantidade += g._count._all;
    if (g.intragrupo) linha.receberAberto.intragrupo += valor;
  }
  for (const g of pagar) {
    const linha = porEmpresa.get(g.empresaId);
    if (!linha) continue;
    const valor = num(g._sum.valorOriginal) - num(g._sum.valorPago);
    linha.pagarAberto.total += valor;
    linha.pagarAberto.quantidade += g._count._all;
    if (g.intragrupo) linha.pagarAberto.intragrupo += valor;
  }
  // Custo por empresa: valoração com o CMPM de cada empresa (fallback global).
  const custosEmp = await custosPorEmpresaItem(
    prismaSemEscopo,
    estoque.map((e) => ({ empresaId: e.empresaId, itemId: e.itemId })),
  );
  for (const e of estoque) {
    const linha = porEmpresa.get(e.empresaId);
    if (!linha) continue;
    // Custo estrito de cada empresa (sem herdar o CMPM global de outra).
    const custo = custosEmp.get(chaveCustoEmpresa(e.empresaId, e.itemId)) ?? 0;
    linha.estoqueValor += num(e.quantidadeAtual) * custo;
  }

  const linhas = Array.from(porEmpresa.values());
  const soma = (f: (l: Linha) => number) => linhas.reduce((acc, l) => acc + f(l), 0);

  // Total do grupo = soma das empresas MENOS o que é intragrupo (anula em pares)
  const grupo = {
    vendas: soma((l) => l.vendas.total) - soma((l) => l.vendas.intragrupo),
    compras: soma((l) => l.compras.total) - soma((l) => l.compras.intragrupo),
    receberAberto: soma((l) => l.receberAberto.total) - soma((l) => l.receberAberto.intragrupo),
    pagarAberto: soma((l) => l.pagarAberto.total) - soma((l) => l.pagarAberto.intragrupo),
    estoqueValor: soma((l) => l.estoqueValor), // estoque é ativo real de cada empresa — sem eliminação
    eliminado: {
      vendas: soma((l) => l.vendas.intragrupo),
      compras: soma((l) => l.compras.intragrupo),
      receberAberto: soma((l) => l.receberAberto.intragrupo),
      pagarAberto: soma((l) => l.pagarAberto.intragrupo),
    },
  };

  return NextResponse.json({
    periodo: { de: de.toISOString(), ate: ate.toISOString() },
    empresas: linhas,
    grupo,
  });
}
