export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { titulosAbertosDaEmpresa } from "@/lib/compensacao";

// Todos os títulos em aberto (a receber e a pagar) da empresa, para a seleção
// LIVRE da compensação (não exige mesmo parceiro).
export async function GET() {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const data = await titulosAbertosDaEmpresa(empresaId);
  return NextResponse.json({ data });
}
