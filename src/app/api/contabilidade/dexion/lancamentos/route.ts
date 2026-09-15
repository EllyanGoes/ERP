export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { dexionLancamentos } from "@/lib/dexion";
import { guardDexion, erroDexion } from "../_shared";

// GET /api/contabilidade/dexion/lancamentos?empresaId&exercicio&conta=3.2.1.1.03&mes=5
// Lançamentos do contador que tocam a conta/prefixo no mês (mes=0 → ano). Cache 12h.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const g = await guardDexion(sp.get("empresaId"));
  if (!g.ok) return g.response;
  const exercicio = Number(sp.get("exercicio") ?? new Date().getFullYear());
  const conta = (sp.get("conta") ?? "").trim();
  const mes = Number(sp.get("mes") ?? 0);
  if (!conta) return NextResponse.json({ error: "Informe a conta." }, { status: 400 });
  const v = await prismaSemEscopo.dexionVinculoEmpresa.findUnique({ where: { empresaId_exercicio: { empresaId: g.empresaId, exercicio } } });
  if (!v) return NextResponse.json({ error: `Sem vínculo com o Dexion para ${exercicio}.` }, { status: 400 });
  try {
    const c = await dexionLancamentos(v.codigoDexion, exercicio, conta, mes, { forcar: sp.get("atualizar") === "1" });
    return NextResponse.json({ data: c.dados, atualizadoEm: c.atualizadoEm, doCache: c.doCache, erroAtualizacao: c.erroAtualizacao ?? null });
  } catch (e) {
    return erroDexion(e);
  }
}
