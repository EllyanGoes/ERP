export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { decimalToNumber } from "@/lib/utils";

// GET /api/contabilidade/cpv-mensal?ano=YYYY
// CPV (3.2.2.*) mês a mês por conta analítica. A DRE mostra o CPV só consolidado;
// aqui abrimos o acompanhamento mensal. Mesma bucketização do dre/route.ts.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const ano = parseInt(searchParams.get("ano") ?? "", 10) || new Date().getUTCFullYear();
  const ini = new Date(Date.UTC(ano, 0, 1));
  const fim = new Date(Date.UTC(ano, 11, 31, 23, 59, 59, 999));

  // Analíticas sob o CPV (3.2.2.*) da empresa ativa.
  const contas = await prisma.contaContabil.findMany({
    where: { grupo: "RESULTADO", tipo: "ANALITICA", ativo: true, codigo: { startsWith: "3.2.2" } },
    select: { id: true, codigo: true, nome: true, natureza: true },
    orderBy: { codigo: "asc" },
  });
  const contaIds = contas.map((c) => c.id);
  const partidas = contaIds.length
    ? await prisma.partidaContabil.findMany({
        where: { contaId: { in: contaIds }, lancamento: { data: { gte: ini, lte: fim } } },
        select: { contaId: true, tipo: true, valor: true, lancamento: { select: { data: true } } },
      })
    : [];

  const z = () => new Array(12).fill(0) as number[];
  const deb = new Map<string, number[]>();
  const cred = new Map<string, number[]>();
  for (const p of partidas) {
    const mes = new Date(p.lancamento.data).getUTCMonth();
    const m = p.tipo === "DEBITO" ? deb : cred;
    if (!m.has(p.contaId)) m.set(p.contaId, z());
    m.get(p.contaId)![mes] += decimalToNumber(p.valor);
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;

  const totalMeses = z();
  let totalTotal = 0;
  const linhas: { id: string; codigo: string; nome: string; meses: number[]; total: number }[] = [];
  for (const c of contas) {
    const d = deb.get(c.id) ?? z();
    const cr = cred.get(c.id) ?? z();
    const meses = z();
    let total = 0;
    for (let i = 0; i < 12; i++) {
      // valor natureza-ajustado (>=0 = lado normal): CPV é devedor (d−c).
      const v = r2(c.natureza === "CREDORA" ? cr[i] - d[i] : d[i] - cr[i]);
      meses[i] = v; total += v;
    }
    total = r2(total);
    if (Math.abs(total) < 0.005 && meses.every((v) => Math.abs(v) < 0.005)) continue; // sem movimento → omite
    for (let i = 0; i < 12; i++) totalMeses[i] = r2(totalMeses[i] + meses[i]);
    totalTotal = r2(totalTotal + total);
    linhas.push({ id: c.id, codigo: c.codigo, nome: c.nome, meses, total });
  }

  return NextResponse.json({ ano, linhas, totalMeses, totalTotal });
}
