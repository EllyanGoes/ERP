export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { dexionEmpresasCache, somenteDigitos } from "@/lib/dexion";
import { guardDexion, erroDexion } from "../_shared";

// GET /api/contabilidade/dexion/empresas — empresas do Dexion (uma por
// exercício) + sugestão de empresa do ERP pelo CNPJ.
export async function GET(req: NextRequest) {
  const g = await guardDexion();
  if (!g.ok) return g.response;
  const forcar = req.nextUrl.searchParams.get("atualizar") === "1";
  try {
    const [cache, erp] = await Promise.all([
      dexionEmpresasCache({ forcar }),
      prismaSemEscopo.empresa.findMany({ select: { id: true, razaoSocial: true, nomeFantasia: true, cnpj: true } }),
    ]);
    const porCnpj = new Map(erp.map((e) => [somenteDigitos(e.cnpj), e]));
    const dexion = cache.dados;
    const data = dexion.map((d) => {
      const m = porCnpj.get(somenteDigitos(d.cnpj));
      return { ...d, sugestaoEmpresaId: m?.id ?? null, sugestaoEmpresaNome: m ? (m.nomeFantasia || m.razaoSocial) : null };
    });
    return NextResponse.json({ data, atualizadoEm: cache.atualizadoEm, doCache: cache.doCache, erroAtualizacao: cache.erroAtualizacao ?? null });
  } catch (e) {
    return erroDexion(e);
  }
}
