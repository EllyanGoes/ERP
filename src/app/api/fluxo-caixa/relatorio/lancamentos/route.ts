export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";

// Drill-down: títulos (CR/CP) de uma natureza no período. Se `mes` (0-11) vier,
// restringe ao mês; senão, retorna o ano todo.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const naturezaId = searchParams.get("naturezaId");
  if (!naturezaId) return NextResponse.json({ error: "naturezaId obrigatório" }, { status: 400 });
  const ano = parseInt(searchParams.get("ano") || `${new Date().getFullYear()}`, 10);
  const mesParam = searchParams.get("mes");
  const mes = mesParam !== null ? parseInt(mesParam, 10) : null;

  const inicio = mes !== null ? new Date(ano, mes, 1) : new Date(ano, 0, 1);
  const fim = mes !== null ? new Date(ano, mes + 1, 1) : new Date(ano + 1, 0, 1);

  const natureza = await prisma.naturezaFinanceira.findUnique({
    where: { id: naturezaId },
    select: { id: true, nome: true, tipo: true },
  });
  if (!natureza) return NextResponse.json({ error: "Natureza não encontrada" }, { status: 404 });

  const periodo = { gte: inicio, lt: fim };
  // Mesmo critério do relatório: o título entra se a natureza está no RATEIO
  // (split) ou, sem split, na natureza única. O valor exibido é o da fatia da
  // natureza no rateio (não o título inteiro).
  const whereNat = {
    status: { notIn: ["CANCELADA" as const] }, dataVencimento: periodo,
    OR: [
      { naturezaFinanceiraId: naturezaId, naturezas: { none: {} } },
      { naturezas: { some: { naturezaFinanceiraId: naturezaId } } },
    ],
  };
  const valorDaNatureza = (c: { valorOriginal: unknown; naturezas: { naturezaFinanceiraId: string; valor: unknown }[] }) =>
    c.naturezas.length > 0
      ? c.naturezas.filter((n) => n.naturezaFinanceiraId === naturezaId).reduce((s, n) => s + Number(n.valor), 0)
      : Number(c.valorOriginal);

  let lancamentos;
  if (natureza.tipo === "ENTRADA") {
    const cr = await prisma.contaReceber.findMany({
      where: whereNat,
      select: {
        id: true, numero: true, descricao: true, valorOriginal: true, valorPago: true,
        dataVencimento: true, status: true,
        naturezas: { select: { naturezaFinanceiraId: true, valor: true } },
        cliente: { select: { razaoSocial: true } },
        pedidoVenda: { select: { numero: true } },
      },
      orderBy: { dataVencimento: "asc" },
    });
    lancamentos = cr.map((c) => ({
      id: c.id, numero: c.numero, descricao: c.descricao,
      valor: valorDaNatureza(c), valorPago: Number(c.valorPago),
      dataVencimento: c.dataVencimento, status: c.status,
      favorecido: c.cliente?.razaoSocial ?? null,
      ref: c.pedidoVenda?.numero ?? null,
      href: `/contas-receber/${c.id}`,
    }));
  } else {
    const cp = await prisma.contaPagar.findMany({
      where: whereNat,
      select: {
        id: true, numero: true, descricao: true, valorOriginal: true, valorPago: true,
        dataVencimento: true, status: true,
        naturezas: { select: { naturezaFinanceiraId: true, valor: true } },
        fornecedor: { select: { razaoSocial: true } },
      },
      orderBy: { dataVencimento: "asc" },
    });
    lancamentos = cp.map((c) => ({
      id: c.id, numero: c.numero, descricao: c.descricao,
      valor: valorDaNatureza(c), valorPago: Number(c.valorPago),
      dataVencimento: c.dataVencimento, status: c.status,
      favorecido: c.fornecedor?.razaoSocial ?? null,
      ref: null,
      href: `/contas-pagar/${c.id}`,
    }));
  }

  const total = lancamentos.reduce((s, l) => s + l.valor, 0);
  return NextResponse.json({ natureza, total, lancamentos });
}
