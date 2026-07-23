export const dynamic = "force-dynamic";
// Vercel: cada chamada processa um LOTE (budget < maxDuration); o cliente
// re-chama até `concluido: true` — a idempotência por tag garante continuação.
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { executarImportPlanilhaCp } from "@/lib/import-planilha-cp";

// POST /api/admin/import-planilha-cp  { dry?: boolean }
// Import da planilha CONTAS A PAGAR (jul/2026) EM PRODUÇÃO — o banco de prod só
// é acessível pelo servidor. Restrito a ADMIN. Rota de uso único: remover após
// o import concluído (o histórico fica no git).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.perfil !== "ADMIN") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { dry?: boolean };
  try {
    const r = await executarImportPlanilhaCp({ dry: body?.dry === true, budgetMs: 40_000 });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro no import" }, { status: 500 });
  }
}
