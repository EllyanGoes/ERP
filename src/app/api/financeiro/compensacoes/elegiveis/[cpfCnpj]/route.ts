export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { getSession } from "@/lib/auth";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { titulosAbertosDoParceiro } from "@/lib/compensacao";

// Títulos em aberto (a receber e a pagar) de um parceiro, para a seleção da
// compensação. `cpfCnpj` já vem só com dígitos.
export async function GET(_req: Request, { params }: { params: { cpfCnpj: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;
  const session = await getSession();
  const empresaId = session?.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const data = await titulosAbertosDoParceiro(empresaId, params.cpfCnpj);
  return NextResponse.json({ data });
}
