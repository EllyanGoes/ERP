export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { decimalToNumber } from "@/lib/utils";

function parseDate(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(value);
  return isNaN(d.getTime()) ? fallback : d;
}

// GET /api/contabilidade/razao?contaId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
// Razão de uma conta: saldo inicial + movimentos (com saldo acumulado). Se a
// conta for sintética, agrega os descendentes (por prefixo de código) — isso dá
// o razão auxiliar (ex.: 1.1.2 Clientes mostra os movimentos de todos os clientes).
export async function GET(req: NextRequest) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const contaId = searchParams.get("contaId");
  if (!contaId) return NextResponse.json({ error: "Informe a conta" }, { status: 400 });

  const hoje = new Date();
  const from = parseDate(searchParams.get("from"), new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const to = parseDate(searchParams.get("to"), hoje);
  from.setUTCHours(0, 0, 0, 0);
  to.setUTCHours(23, 59, 59, 999);

  const conta = await prisma.contaContabil.findUnique({
    where: { id: contaId },
    select: { id: true, codigo: true, nome: true, natureza: true, tipo: true },
  });
  if (!conta) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });

  // Conta + descendentes (sintética agrega as analíticas sob ela).
  const descendentes = await prisma.contaContabil.findMany({
    where: { OR: [{ id: conta.id }, { codigo: { startsWith: conta.codigo + "." } }] },
    select: { id: true },
  });
  const ids = descendentes.map((c) => c.id);
  const dev = conta.natureza === "DEVEDORA";

  const [antes, movs] = await Promise.all([
    prisma.partidaContabil.groupBy({
      by: ["tipo"],
      where: { contaId: { in: ids }, lancamento: { data: { lt: from } } },
      _sum: { valor: true },
    }),
    prisma.partidaContabil.findMany({
      where: { contaId: { in: ids }, lancamento: { data: { gte: from, lte: to } } },
      select: {
        tipo: true, valor: true,
        conta: { select: { codigo: true, nome: true } },
        lancamento: { select: { data: true, historico: true, origemTipo: true } },
      },
      orderBy: [{ lancamento: { data: "asc" } }, { id: "asc" }],
    }),
  ]);

  let debAntes = 0, credAntes = 0;
  for (const a of antes) {
    if (a.tipo === "DEBITO") debAntes = decimalToNumber(a._sum.valor); else credAntes = decimalToNumber(a._sum.valor);
  }
  const saldoInicial = dev ? debAntes - credAntes : credAntes - debAntes;

  let saldo = saldoInicial;
  const movimentos = movs.map((m) => {
    const v = decimalToNumber(m.valor);
    const deb = m.tipo === "DEBITO" ? v : 0;
    const cred = m.tipo === "CREDITO" ? v : 0;
    saldo += dev ? deb - cred : cred - deb;
    return {
      data: m.lancamento.data,
      historico: m.lancamento.historico,
      origemTipo: m.lancamento.origemTipo,
      contaCodigo: m.conta.codigo,
      contaNome: m.conta.nome,
      debito: deb,
      credito: cred,
      saldo,
    };
  });

  return NextResponse.json({
    conta,
    saldoInicial,
    movimentos,
    saldoFinal: saldo,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  });
}
