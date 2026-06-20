export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function decNum(val: unknown): number {
  if (val == null) return 0;
  return parseFloat(String(val));
}

export async function GET() {
  const now     = new Date();
  const since90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const items = await prisma.item.findMany({
    where: { favorito: true, ativo: true },
    select: {
      id: true,
      codigo: true,
      descricao: true,
      estoqueMinimo: true,
      estoqueMaximo: true,
      pontoReposicao: true,
      leadTimeDias: true,
      unidade:      { select: { sigla: true } },
      unidadeMedida: true,
      estoqueItems: { where: { clienteDonoId: null }, select: { quantidadeAtual: true } },
    },
    orderBy: { descricao: "asc" },
  });

  const allMovs = await prisma.movimentacaoEstoque.findMany({
    where: {
      itemId:    { in: items.map((i) => i.id) },
      clienteDonoId: null,
      createdAt: { gte: since90 },
      tipo:      "SAIDA",
    },
    select: { itemId: true, quantidade: true },
  });

  const saidasByItem: Record<string, number> = {};
  for (const m of allMovs) {
    saidasByItem[m.itemId] = (saidasByItem[m.itemId] ?? 0) + decNum(m.quantidade);
  }

  const rows = items.map((item) => {
    const sigla        = item.unidade?.sigla || item.unidadeMedida || "UN";
    const saldoAtual   = item.estoqueItems.reduce((s, e) => s + decNum(e.quantidadeAtual), 0);
    const leadTime     = item.leadTimeDias ?? 7;
    const consumoDiario = (saidasByItem[item.id] ?? 0) / 90;

    const pr  = item.pontoReposicao != null ? decNum(item.pontoReposicao) : consumoDiario * leadTime;
    const eds = item.estoqueMinimo  != null ? decNum(item.estoqueMinimo)  : consumoDiario * 3;
    const emax = item.estoqueMaximo != null ? decNum(item.estoqueMaximo)  : null;

    let previsaoRuptura: string;
    let status: "ok" | "alerta" | "critico";

    if (consumoDiario === 0) {
      previsaoRuptura = "—";
      status          = "ok";
    } else if (saldoAtual <= eds) {
      previsaoRuptura = "CRÍTICO";
      status          = "critico";
    } else {
      const dias = Math.floor(saldoAtual / consumoDiario);
      const dtStr = new Date(now.getTime() + dias * 24 * 60 * 60 * 1000)
        .toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "America/Sao_Paulo" });
      previsaoRuptura = `${dias}d (${dtStr})`;
      status = dias <= leadTime ? "critico" : dias <= leadTime * 2 ? "alerta" : "ok";
    }

    return {
      id: item.id,
      codigo: item.codigo,
      descricao: item.descricao,
      sigla,
      saldoAtual,
      consumoDiario,
      pontoReposicao: pr,
      estoqueMinimo: eds,
      estoqueMaximo: emax,
      leadTime,
      previsaoRuptura,
      status,
    };
  });

  const criticos = rows.filter((r) => r.status === "critico").length;
  const alertas  = rows.filter((r) => r.status === "alerta").length;

  return NextResponse.json({ rows, criticos, alertas, total: rows.length });
}
