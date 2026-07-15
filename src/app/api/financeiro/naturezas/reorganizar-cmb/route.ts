export const dynamic = "force-dynamic";
export const maxDuration = 300;
// Reorganização ÚNICA das naturezas da CIMENTO E MIX (plano padrão do Nibo,
// decisões do dono em 15/07/2026) — ver src/lib/reorganizar-naturezas-cmb.ts.
// POST { dry: true } devolve a prévia (contagens) sem alterar nada;
// POST { dry: false } aplica (backup + renames + creates + merges + recontabilização).
// Restrita a ADMIN com a CMB como empresa ativa. Idempotente — repetir é inócuo.
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { executarReorganizacaoNaturezasCMB } from "@/lib/reorganizar-naturezas-cmb";

export async function POST(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;
  if (auth.session.perfil !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });
  }
  if (auth.session.activeEmpresaId !== "emp_cimentomix") {
    return NextResponse.json({ error: "Troque para a CIMENTO E MIX BR — a reorganização é só dela." }, { status: 422 });
  }

  const body = await req.json().catch(() => ({}));
  const dry = body?.dry !== false; // seguro por padrão: só aplica com dry:false explícito

  try {
    const resultado = await executarReorganizacaoNaturezasCMB(dry);
    return NextResponse.json({ data: resultado });
  } catch (err) {
    console.error("[reorganizar-cmb]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro na reorganização" }, { status: 500 });
  }
}
