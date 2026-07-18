export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const data = req.nextUrl.searchParams.get("data"); // "YYYY-MM-DD"
  if (!data) return NextResponse.json({ error: "data obrigatória" }, { status: 400 });
  const modo = req.nextUrl.searchParams.get("modo") === "realizado" ? "realizado" : "projetado";

  const inicio = new Date(`${data}T00:00:00`);
  const fim = new Date(`${data}T23:59:59`);

  // Realizado: recebimentos/pagamentos DE FATO nesse dia (LancamentoFinanceiro),
  // fora transferências. Mapeia para o mesmo formato (cr/cp) do drill-down.
  if (modo === "realizado") {
    const lfs = await prisma.lancamentoFinanceiro.findMany({
      where: { transferenciaParId: null, dataLancamento: { gte: inicio, lte: fim }, contaBancaria: { compensacao: false, permuta: false } },
      orderBy: { dataLancamento: "asc" },
      select: {
        id: true, tipo: true, descricao: true, valor: true, favorecido: true,
        contaReceber: { select: { numero: true, cliente: { select: { razaoSocial: true } } } },
        contaPagar: { select: { id: true, numero: true, categoria: true, fornecedor: { select: { razaoSocial: true } } } },
      },
    });
    const cr = lfs.filter((l) => l.tipo === "RECEITA").map((l) => ({
      id: l.id, numero: l.contaReceber?.numero ?? "—", descricao: l.descricao,
      valorOriginal: l.valor, valorPago: l.valor, status: "PAGA",
      cliente: l.contaReceber?.cliente ?? (l.favorecido ? { razaoSocial: l.favorecido } : null),
      pedidoVenda: null,
    }));
    const cp = lfs.filter((l) => l.tipo === "DESPESA").map((l) => ({
      id: l.contaPagar?.id ?? l.id, numero: l.contaPagar?.numero ?? "—", descricao: l.descricao,
      categoria: l.contaPagar?.categoria ?? "", valorOriginal: l.valor, valorPago: l.valor, status: "PAGA",
      fornecedor: l.contaPagar?.fornecedor ?? (l.favorecido ? { razaoSocial: l.favorecido } : null),
    }));
    const totalCR = cr.reduce((s, c) => s + parseFloat(c.valorOriginal.toString()), 0);
    const totalCP = cp.reduce((s, c) => s + parseFloat(c.valorOriginal.toString()), 0);
    return NextResponse.json({ cr, cp, totalCR, totalCP, data, modo });
  }

  const [cr, cp] = await Promise.all([
    prisma.contaReceber.findMany({
      where: {
        status: { notIn: ["CANCELADA"] },
        dataVencimento: { gte: inicio, lte: fim },
      },
      orderBy: { dataVencimento: "asc" },
      select: {
        id: true,
        numero: true,
        descricao: true,
        valorOriginal: true,
        valorPago: true,
        status: true,
        cliente: { select: { razaoSocial: true } },
        pedidoVenda: { select: { numero: true } },
      },
    }),
    prisma.contaPagar.findMany({
      where: {
        status: { notIn: ["CANCELADA"] },
        dataVencimento: { gte: inicio, lte: fim },
      },
      orderBy: { dataVencimento: "asc" },
      select: {
        id: true,
        numero: true,
        descricao: true,
        categoria: true,
        valorOriginal: true,
        valorPago: true,
        status: true,
        fornecedor: { select: { razaoSocial: true } },
      },
    }),
  ]);

  const totalCR = cr.reduce((s, c) => s + parseFloat(c.valorOriginal.toString()), 0);
  const totalCP = cp.reduce((s, c) => s + parseFloat(c.valorOriginal.toString()), 0);

  return NextResponse.json({ cr, cp, totalCR, totalCP, data });
}
