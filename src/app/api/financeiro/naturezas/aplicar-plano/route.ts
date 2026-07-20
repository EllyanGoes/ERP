export const dynamic = "force-dynamic";
export const maxDuration = 300;
// Reestruturação do plano de naturezas da TRAMONTIN (9 grupos com código,
// jul/2026) — ver src/lib/reorganizar-naturezas-plano.ts.
// POST { dry: true } devolve a prévia completa (criar/desativar/remapear/sem
// sucessora) sem alterar nada; POST { dry: false } aplica (backup + seed +
// migração das chaves de sistema + desativação com sucessora + remap de
// defaults). Restrita a ADMIN com a Tramontin como empresa ativa. Idempotente.
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { executarPlanoNaturezasTramontin } from "@/lib/reorganizar-naturezas-plano";

export async function POST(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;
  if (auth.session.perfil !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });
  }
  if (auth.session.activeEmpresaId !== "emp_tramontin") {
    return NextResponse.json({ error: "Troque para a Cerâmica Tramontin — o plano novo é dela." }, { status: 422 });
  }

  const body = await req.json().catch(() => ({}));
  const dry = body?.dry !== false; // seguro por padrão: só aplica com dry:false explícito

  try {
    const resultado = await executarPlanoNaturezasTramontin(dry);
    return NextResponse.json({ data: resultado });
  } catch (err) {
    console.error("[aplicar-plano-naturezas]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro na aplicação do plano" }, { status: 500 });
  }
}
