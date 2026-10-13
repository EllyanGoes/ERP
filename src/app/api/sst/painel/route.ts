export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { conformidadeEmpresa } from "@/lib/sst";

// GET /api/sst/painel — conformidade da empresa ativa.
export async function GET() {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const data = await conformidadeEmpresa(empresaId);
  return NextResponse.json({ data });
}
