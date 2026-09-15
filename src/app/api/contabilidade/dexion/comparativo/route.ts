export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";
import { dexionBalancete } from "@/lib/dexion";
import { guardDexion, erroDexion } from "../_shared";

// GET /api/contabilidade/dexion/comparativo?empresaId&exercicio&ate=9&nivel=3
// Balancete do Dexion lado a lado com o do ERP, pelo De-Para de contas.
// Saldo do ERP na conta = soma das partidas das analíticas descendentes até o
// fim do mês `ate` (devedor positivo, credor negativo — mesma convenção do Dexion).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const g = await guardDexion(sp.get("empresaId"));
  if (!g.ok) return g.response;
  const exercicio = Number(sp.get("exercicio") ?? new Date().getFullYear());
  const ate = Math.min(12, Math.max(1, Number(sp.get("ate") ?? 12)));
  const nivel = Number(sp.get("nivel") ?? 3);

  const v = await prismaSemEscopo.dexionVinculoEmpresa.findUnique({ where: { empresaId_exercicio: { empresaId: g.empresaId, exercicio } } });
  if (!v) return NextResponse.json({ error: `Sem vínculo com o Dexion para ${exercicio}. Cadastre na aba Vínculos.` }, { status: 400 });

  const fim = new Date(Date.UTC(exercicio, ate, 0, 23, 59, 59, 999)); // último dia do mês `ate`

  try {
    const [dexion, contas, partidas, dePara] = await Promise.all([
      dexionBalancete(v.codigoDexion, exercicio, ate),
      prismaSemEscopo.contaContabil.findMany({ where: { empresaId: g.empresaId }, select: { id: true, codigo: true, nome: true, paiId: true, nivel: true, aceitaLancamento: true } }),
      prismaSemEscopo.partidaContabil.groupBy({
        by: ["contaId", "tipo"],
        where: { lancamento: { empresaId: g.empresaId, data: { lte: fim } } },
        _sum: { valor: true },
      }),
      prismaSemEscopo.dexionDePara.findMany({ where: { empresaId: g.empresaId } }),
    ]);

    // Saldo por conta do ERP (folhas), depois agrega pela árvore (paiId).
    const saldo = new Map<string, number>();
    for (const p of partidas) {
      const val = decimalToNumber(p._sum.valor);
      saldo.set(p.contaId, (saldo.get(p.contaId) ?? 0) + (p.tipo === "DEBITO" ? val : -val));
    }
    const filhos = new Map<string, string[]>();
    for (const c of contas) if (c.paiId) filhos.set(c.paiId, [...(filhos.get(c.paiId) ?? []), c.id]);
    const memo = new Map<string, number>();
    const saldoArvore = (id: string): number => {
      if (memo.has(id)) return memo.get(id)!;
      let s = saldo.get(id) ?? 0;
      for (const f of filhos.get(id) ?? []) s += saldoArvore(f);
      memo.set(id, +s.toFixed(2));
      return memo.get(id)!;
    };
    const contaPorId = new Map(contas.map((c) => [c.id, c]));
    const mapa = new Map(dePara.map((d) => [d.contaDexion, d.contaContabilId]));

    const data = dexion
      .filter((c) => c.nivel <= nivel)
      .map((c) => {
        const erpId = mapa.get(c.conta) ?? null;
        const erp = erpId ? contaPorId.get(erpId) : null;
        const saldoErp = erp ? saldoArvore(erp.id) : null;
        return {
          ...c,
          erpContaId: erp?.id ?? null,
          erpCodigo: erp?.codigo ?? null,
          erpNome: erp?.nome ?? null,
          saldoErp,
          diferenca: saldoErp == null ? null : +(c.saldoFinal - saldoErp).toFixed(2),
        };
      });

    return NextResponse.json({
      data,
      contasErp: contas.map((c) => ({ id: c.id, codigo: c.codigo, nome: c.nome, nivel: c.nivel, aceitaLancamento: c.aceitaLancamento })),
      codigoDexion: v.codigoDexion, exercicio, ate, fim: fim.toISOString(),
    });
  } catch (e) {
    return erroDexion(e);
  }
}
