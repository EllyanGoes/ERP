export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { getSession } from "@/lib/auth";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { garantirTiposOperacaoPadrao } from "@/lib/tes-padrao";

// Cria o conjunto PADRÃO de TES na empresa ativa (idempotente).
export async function POST() {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;
  const session = await getSession();
  const empresaId = session?.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const resultado = await garantirTiposOperacaoPadrao(empresaId);
  return NextResponse.json(resultado);
}
