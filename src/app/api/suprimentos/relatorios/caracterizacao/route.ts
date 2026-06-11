export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { custosPorEmpresaItem, chaveCustoEmpresa } from "@/lib/custo-empresa";

/**
 * GET /api/suprimentos/relatorios/caracterizacao
 *
 * Calcula Curva ABC + IMD (Intervalo Médio entre Demandas) para todos os itens.
 *
 * Curva ABC — baseada no Valor de Consumo Anual (anualizado dos últimos 36 meses):
 *   Classe A → acumula até 80% do valor total
 *   Classe B → acumula de 80% a 95%
 *   Classe C → acumula de 95% a 100%
 *
 * IMD = Meses COM Consumo / Meses SEM Consumo
 *   (quanto maior, mais frequente é a demanda)
 *   > 5   → Estocável  — alta frequência; manter em estoque
 *   2 a 5 → MTO        — demanda irregular; comprar conforme necessidade
 *   < 2   → Obsoleto   — baixíssima demanda; reavaliar necessidade de estoque
 *
 * Casos especiais:
 *   mesesSemConsumo = 0  →  consumido em TODOS os meses → IMD = 999 (Estocável)
 *   mesesComConsumo = 0  →  nunca consumido              → IMD = 0   (Obsoleto)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dataInicio = searchParams.get("dataInicio");
  const dataFim    = searchParams.get("dataFim");
  const localId    = searchParams.get("localId");

  let startDate: Date;
  let endDate: Date;
  let PERIOD_MONTHS: number;

  if (dataInicio && dataFim) {
    startDate = new Date(dataInicio + "T00:00:00");
    endDate   = new Date(dataFim    + "T23:59:59");
    // Period in months (inclusive): at least 1
    PERIOD_MONTHS = Math.max(
      1,
      (endDate.getFullYear() - startDate.getFullYear()) * 12 +
      (endDate.getMonth()    - startDate.getMonth()) + 1
    );
  } else {
    PERIOD_MONTHS = 36;
    startDate = new Date();
    startDate.setMonth(startDate.getMonth() - PERIOD_MONTHS);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date();
  }

  // ── 1. Busca todos os itens ativos ─────────────────────────────────────────
  const items = await prisma.item.findMany({
    where: { ativo: true },
    select: {
      id: true,
      codigo: true,
      descricao: true,
      precoCusto: true,
      unidade:      { select: { sigla: true } },
      unidadeMedida: true,
      tipoProduto:  { select: { nome: true } },
      estoqueItems: { where: { clienteDonoId: null }, select: { quantidadeAtual: true } },
    },
    orderBy: { codigo: "asc" },
  });

  // ── 2. Busca saídas do período ────────────────────────────────────────────
  const saidas = await prisma.movimentacaoEstoque.findMany({
    where: {
      tipo:      "SAIDA",
      clienteDonoId: null,
      createdAt: { gte: startDate, lte: endDate },
      ...(localId ? { localEstoqueId: localId } : {}),
    },
    select: {
      itemId:        true,
      quantidade:    true,
      valorUnitario: true,
      createdAt:     true,
    },
  });

  // Agrupa saídas por item
  const saidasByItem = new Map<string, typeof saidas>();
  for (const s of saidas) {
    if (!saidasByItem.has(s.itemId)) saidasByItem.set(s.itemId, []);
    saidasByItem.get(s.itemId)!.push(s);
  }

  // ── 3. Calcula métricas por item ───────────────────────────────────────────
  type Row = {
    itemId: string;
    codigo: string;
    descricao: string;
    tipoProduto: string | null;
    unidade: string;
    estoqueAtual: number;
    custo: number;
    // ABC
    valorConsumoAnual: number;
    pctConsumo: number;
    pctAcumulado: number;
    curvaABC: "A" | "B" | "C";
    // IMD
    mesesComConsumo: number;
    mesesSemConsumo: number;
    imd: number;
    categoriaIMD: "ESTOCAVEL" | "MTO" | "OBSOLETO";
  };

  // Custo por empresa: o relatório roda no escopo da empresa ativa, então o
  // valor de consumo usa o CMPM dela (fallback no CMPM global do Item).
  const session = await getSession();
  const empresaAtiva = session?.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const custosEmp = await custosPorEmpresaItem(
    prisma,
    items.map((i) => ({ empresaId: empresaAtiva, itemId: i.id })),
  );

  const rows: Row[] = items.map((item) => {
    const movs  = saidasByItem.get(item.id) ?? [];
    const custo = custosEmp.get(chaveCustoEmpresa(empresaAtiva, item.id))
      ?? (item.precoCusto ? parseFloat(item.precoCusto.toString()) : 0);

    // Meses distintos com ao menos uma saída
    const monthsWithConsumption = new Set<string>();
    let totalValorConsumo = 0;

    for (const m of movs) {
      const d = new Date(m.createdAt);
      // getMonth() retorna 0-11; usamos +1 para chave correta (01–12)
      monthsWithConsumption.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      const qty  = parseFloat(m.quantidade.toString());
      const cost = m.valorUnitario ? parseFloat(m.valorUnitario.toString()) : custo;
      totalValorConsumo += qty * cost;
    }

    const mesesComConsumo = monthsWithConsumption.size;
    const mesesSemConsumo = PERIOD_MONTHS - mesesComConsumo;

    // IMD = Meses COM Consumo / Meses SEM Consumo
    //   mesesSem = 0 → consumido todos os meses → Estocável máximo (999)
    //   mesesCom = 0 → nunca consumido           → IMD = 0 (Obsoleto)
    const imd = mesesSemConsumo === 0
      ? 999
      : Math.round((mesesComConsumo / mesesSemConsumo) * 100) / 100;

    const categoriaIMD: "ESTOCAVEL" | "MTO" | "OBSOLETO" =
      imd > 5 ? "ESTOCAVEL" : imd > 2 ? "MTO" : "OBSOLETO";

    // Valor de Consumo Anual: anualiza os 36 meses → ×(12/36)
    const valorConsumoAnual = (totalValorConsumo / PERIOD_MONTHS) * 12;

    const estoqueAtual = item.estoqueItems.reduce(
      (s, e) => s + parseFloat(e.quantidadeAtual.toString()), 0
    );

    return {
      itemId:     item.id,
      codigo:     item.codigo,
      descricao:  item.descricao,
      tipoProduto: item.tipoProduto?.nome ?? null,
      unidade:    item.unidade?.sigla ?? item.unidadeMedida,
      estoqueAtual,
      custo,
      valorConsumoAnual,
      pctConsumo:   0,   // preenchido após sort
      pctAcumulado: 0,
      curvaABC:     "C", // idem
      mesesComConsumo,
      mesesSemConsumo,
      imd,
      categoriaIMD,
    };
  });

  // ── 4. Curva ABC ───────────────────────────────────────────────────────────
  rows.sort((a, b) => b.valorConsumoAnual - a.valorConsumoAnual);

  const totalConsumoAnual = rows.reduce((s, r) => s + r.valorConsumoAnual, 0);
  let acumulado = 0;

  for (const row of rows) {
    const pct = totalConsumoAnual > 0
      ? (row.valorConsumoAnual / totalConsumoAnual) * 100
      : 0;
    acumulado        += pct;
    row.pctConsumo    = Math.round(pct * 100) / 100;
    row.pctAcumulado  = Math.round(acumulado * 100) / 100;
    row.curvaABC      = acumulado <= 80 ? "A" : acumulado <= 95 ? "B" : "C";
  }

  // ── 5. Resumo ──────────────────────────────────────────────────────────────
  const classA = rows.filter((r) => r.curvaABC === "A");
  const classB = rows.filter((r) => r.curvaABC === "B");
  const classC = rows.filter((r) => r.curvaABC === "C");
  const n      = rows.length || 1;

  const summary = {
    totalItems: rows.length,
    classA: {
      count: classA.length,
      pctItems: Math.round((classA.length / n) * 100),
      pctValor: Math.round(classA.reduce((s, r) => s + r.pctConsumo, 0)),
    },
    classB: {
      count: classB.length,
      pctItems: Math.round((classB.length / n) * 100),
      pctValor: Math.round(classB.reduce((s, r) => s + r.pctConsumo, 0)),
    },
    classC: {
      count: classC.length,
      pctItems: Math.round((classC.length / n) * 100),
      pctValor: Math.round(classC.reduce((s, r) => s + r.pctConsumo, 0)),
    },
    estocavel: rows.filter((r) => r.categoriaIMD === "ESTOCAVEL").length,
    mto:       rows.filter((r) => r.categoriaIMD === "MTO").length,
    obsoleto:  rows.filter((r) => r.categoriaIMD === "OBSOLETO").length,
    totalConsumoAnual,
  };

  return NextResponse.json({ rows, summary, periodMonths: PERIOD_MONTHS });
}
