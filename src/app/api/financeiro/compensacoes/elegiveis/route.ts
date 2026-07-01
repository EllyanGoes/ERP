export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { getSession } from "@/lib/auth";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { parceirosElegiveisCompensacao } from "@/lib/compensacao";

// Parceiros elegíveis a Encontro de Contas na empresa ativa (têm CR e CP em aberto
// sob o mesmo CNPJ).
export async function GET() {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;
  const session = await getSession();
  const empresaId = session?.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const data = await parceirosElegiveisCompensacao(empresaId);
  return NextResponse.json({ data });
}
