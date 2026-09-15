import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import type { SessionPayload } from "@/lib/auth";

// Guarda comum das rotas do Dexion: módulo contabilidade + a empresa pedida
// precisa estar entre as que o usuário pode ativar.
export async function guardDexion(empresaIdPedida?: string | null) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return { ok: false as const, response: auth.response };
  const s = auth.session as SessionPayload;
  const empresaId = empresaIdPedida || s.activeEmpresaId || "emp_tramontin";
  const permitidas = s.empresaIds ?? [];
  if (permitidas.length > 0 && !permitidas.includes(empresaId)) {
    return { ok: false as const, response: NextResponse.json({ error: "Empresa fora do seu acesso." }, { status: 403 }) };
  }
  return { ok: true as const, session: s, empresaId };
}

export function erroDexion(e: unknown) {
  const msg = e instanceof Error ? e.message : "Erro na integração Dexion";
  return NextResponse.json({ error: msg }, { status: 502 });
}
