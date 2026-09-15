export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { dexionBalanceteCache, cortarBalancete } from "@/lib/dexion";
import { guardDexion, erroDexion } from "../_shared";

// GET /api/contabilidade/dexion/balancete?empresaId&exercicio&ate=9&nivel=3
// Balancete do contador (Dexion) p/ a empresa/exercício vinculados.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const g = await guardDexion(sp.get("empresaId"));
  if (!g.ok) return g.response;
  const exercicio = Number(sp.get("exercicio") ?? new Date().getFullYear());
  const ate = Number(sp.get("ate") ?? 12);
  const nivel = Number(sp.get("nivel") ?? 99);
  const v = await prismaSemEscopo.dexionVinculoEmpresa.findUnique({ where: { empresaId_exercicio: { empresaId: g.empresaId, exercicio } } });
  if (!v) return NextResponse.json({ error: `Sem vínculo com o Dexion para ${exercicio}. Cadastre na aba Vínculos.` }, { status: 400 });
  const forcar = sp.get("atualizar") === "1";
  try {
    const cache = await dexionBalanceteCache(v.codigoDexion, exercicio, { forcar });
    const data = cortarBalancete(cache.dados, ate).filter((c) => c.nivel <= nivel);
    return NextResponse.json({ data, codigoDexion: v.codigoDexion, exercicio, ate, atualizadoEm: cache.atualizadoEm, doCache: cache.doCache, erroAtualizacao: cache.erroAtualizacao ?? null });
  } catch (e) {
    return erroDexion(e);
  }
}
