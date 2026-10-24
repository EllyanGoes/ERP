export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { gerarPreventivas } from "@/lib/manutencao/preventivas";

// POST /api/pcm/preventivas — "gerar agora" as preventivas vencendo da empresa ativa
// (o cron diário faz o mesmo para todas as empresas).
export async function POST() {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const r = await gerarPreventivas({ empresaId: auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID, usuario: auth.session.nome });
  return NextResponse.json({ data: r });
}
