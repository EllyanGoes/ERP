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

// GET /api/contabilidade/balanco?data=YYYY-MM-DD
// Balanço Patrimonial da empresa ativa numa data: Ativo × Passivo + Patrimônio
// Líquido. O resultado do exercício (grupo Resultado, acumulado até a data) é
// somado ao PL como "Resultado do Exercício" (sem lançamento de encerramento).
export async function GET(req: NextRequest) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const data = parseDate(searchParams.get("data"), new Date());
  data.setUTCHours(23, 59, 59, 999);

  const [contas, partidas] = await Promise.all([
    prisma.contaContabil.findMany({
      select: { id: true, codigo: true, nome: true, grupo: true, natureza: true, tipo: true, paiId: true, nivel: true },
    }),
    prisma.partidaContabil.groupBy({
      by: ["contaId", "tipo"],
      where: { lancamento: { data: { lte: data } } },
      _sum: { valor: true },
    }),
  ]);

  // Débito/crédito acumulado por conta (folhas que receberam partidas).
  const deb = new Map<string, number>();
  const cred = new Map<string, number>();
  for (const p of partidas) {
    const m = p.tipo === "DEBITO" ? deb : cred;
    m.set(p.contaId, (m.get(p.contaId) ?? 0) + decimalToNumber(p._sum.valor));
  }

  // Saldo (natureza) agregando descendentes por prefixo de código.
  function saldoConta(c: (typeof contas)[number]): number {
    let d = 0, cr = 0;
    for (const c2 of contas) {
      if (c2.codigo === c.codigo || c2.codigo.startsWith(c.codigo + ".")) {
        d += deb.get(c2.id) ?? 0;
        cr += cred.get(c2.id) ?? 0;
      }
    }
    return c.natureza === "DEVEDORA" ? d - cr : cr - d;
  }

  type Linha = { id: string; codigo: string; nome: string; tipo: string; natureza: string; nivel: number; saldo: number };
  const linhasDoGrupo = (grupo: string): Linha[] =>
    contas
      .filter((c) => c.grupo === grupo)
      .map((c) => ({ id: c.id, codigo: c.codigo, nome: c.nome, tipo: c.tipo, natureza: c.natureza, nivel: c.nivel, saldo: saldoConta(c) }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));

  const ativo = linhasDoGrupo("ATIVO");
  const passivo = linhasDoGrupo("PASSIVO");
  const patrimonioLiquido = linhasDoGrupo("PATRIMONIO_LIQUIDO");

  // Total de um grupo = soma das contas RAIZ desse grupo (nível mínimo presente),
  // evitando dupla contagem das sintéticas.
  const totalGrupo = (linhas: Linha[]): number => {
    if (linhas.length === 0) return 0;
    const min = Math.min(...linhas.map((l) => l.nivel));
    return linhas.filter((l) => l.nivel === min).reduce((s, l) => s + l.saldo, 0);
  };

  const totalAtivo = totalGrupo(ativo);
  const totalPassivo = totalGrupo(passivo);
  const totalPL = totalGrupo(patrimonioLiquido);

  // Resultado do exercício (grupo RESULTADO, acumulado até a data): receitas −
  // custos − despesas. Receita é credora (cr−d); custo/despesa devedora (d−cr).
  let resultadoExercicio = 0;
  for (const c of contas) {
    if (c.grupo !== "RESULTADO" || c.tipo !== "ANALITICA") continue;
    const d = deb.get(c.id) ?? 0, cr = cred.get(c.id) ?? 0;
    resultadoExercicio += c.natureza === "CREDORA" ? cr - d : -(d - cr);
  }

  const totalPLcomResultado = totalPL + resultadoExercicio;
  const confere = Math.abs(totalAtivo - (totalPassivo + totalPLcomResultado)) < 0.005;

  return NextResponse.json({
    ativo, passivo, patrimonioLiquido,
    totalAtivo, totalPassivo, totalPL, resultadoExercicio, totalPLcomResultado,
    confere,
    data: data.toISOString().slice(0, 10),
  });
}
