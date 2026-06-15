export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { decimalToNumber } from "@/lib/utils";

// GET /api/comercial/relatorios/faturamento-diario?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Resumo de faturamento diário: lista, por pedido faturado (concluído) no
// período, o cliente, os itens, o valor total, a(s) forma(s) de pagamento e a(s)
// conta(s) de recebimento. Datado pela data de conclusão (fechamento do dia).
// Janela ancorada em UTC, igual ao armazenamento/exibição dos campos de data.
function dateUTC(s: string | null, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(`${s}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? fallback : d;
}

export async function GET(req: NextRequest) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const hojeSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const from = dateUTC(searchParams.get("from"), new Date(`${hojeSP}T00:00:00.000Z`));
  const to = dateUTC(searchParams.get("to"), new Date(`${hojeSP}T00:00:00.000Z`));
  to.setUTCHours(23, 59, 59, 999);

  const pedidos = await prisma.pedidoVenda.findMany({
    where: {
      status: { not: "CANCELADO" },
      dataConclusao: { gte: from, lte: to },
    },
    orderBy: [{ dataConclusao: "asc" }, { numero: "asc" }],
    select: {
      id: true, numero: true, dataConclusao: true, valorTotal: true, formaPagamento: true, modalidade: true,
      cliente: { select: { razaoSocial: true, nomeFantasia: true } },
      itens: {
        select: {
          quantidade: true, valorTotal: true,
          item: { select: { codigo: true, descricao: true, unidade: { select: { sigla: true } } } },
        },
      },
      pagamentos: {
        orderBy: { ordem: "asc" },
        select: { forma: true, valor: true, contaBancaria: { select: { nome: true } } },
      },
    },
  });

  const data = pedidos.map((p) => {
    const contas = Array.from(new Set(p.pagamentos.map((pg) => pg.contaBancaria?.nome).filter(Boolean) as string[]));
    const formaResumo = p.formaPagamento
      || Array.from(new Set(p.pagamentos.map((pg) => pg.forma))).join(" + ")
      || "—";
    return {
      id: p.id,
      numero: p.numero,
      data: p.dataConclusao ? p.dataConclusao.toISOString().slice(0, 10) : null,
      clienteNome: p.cliente.nomeFantasia || p.cliente.razaoSocial,
      valorTotal: decimalToNumber(p.valorTotal),
      formaPagamento: formaResumo,
      contas, // nomes das contas de recebimento
      itens: p.itens.map((it) => ({
        codigo: it.item.codigo,
        descricao: it.item.descricao,
        unidade: it.item.unidade?.sigla ?? "",
        quantidade: decimalToNumber(it.quantidade),
        valor: decimalToNumber(it.valorTotal),
      })),
    };
  });

  const total = data.reduce((s, r) => s + r.valorTotal, 0);
  return NextResponse.json({
    data,
    total,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  });
}
