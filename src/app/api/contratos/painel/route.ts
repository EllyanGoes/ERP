export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { resumoContratos } from "@/lib/contratos";

// GET /api/contratos/painel?grupo=1 — agregados da empresa ativa (ou de todas, no modo grupo).
export async function GET(req: NextRequest) {
  const auth = await requireModulo("contratos");
  if (!auth.ok) return auth.response;
  const grupo = new URL(req.url).searchParams.get("grupo") === "1";
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  if (!grupo) return NextResponse.json({ data: { ...(await resumoContratos(empresaId)), empresaId } });
  const empresas = await prismaSemEscopo.empresa.findMany({ select: { id: true, nomeFantasia: true, razaoSocial: true } });
  const porEmpresa = await Promise.all(empresas.map(async (e) => ({ empresaId: e.id, nome: e.nomeFantasia || e.razaoSocial, ...(await resumoContratos(e.id)) })));
  return NextResponse.json({ data: { grupo: true, empresas: porEmpresa } });
}
