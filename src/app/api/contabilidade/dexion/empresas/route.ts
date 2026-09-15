export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { dexionEmpresas, somenteDigitos } from "@/lib/dexion";
import { guardDexion, erroDexion } from "../_shared";

// GET /api/contabilidade/dexion/empresas — empresas do Dexion (uma por
// exercício) + sugestão de empresa do ERP pelo CNPJ.
export async function GET() {
  const g = await guardDexion();
  if (!g.ok) return g.response;
  try {
    const [dexion, erp] = await Promise.all([
      dexionEmpresas(),
      prismaSemEscopo.empresa.findMany({ select: { id: true, razaoSocial: true, nomeFantasia: true, cnpj: true } }),
    ]);
    const porCnpj = new Map(erp.map((e) => [somenteDigitos(e.cnpj), e]));
    const data = dexion.map((d) => {
      const m = porCnpj.get(somenteDigitos(d.cnpj));
      return { ...d, sugestaoEmpresaId: m?.id ?? null, sugestaoEmpresaNome: m ? (m.nomeFantasia || m.razaoSocial) : null };
    });
    return NextResponse.json({ data });
  } catch (e) {
    return erroDexion(e);
  }
}
