export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { gerarPreventivas } from "@/lib/manutencao/preventivas";

// GET /api/pcm/preventivas — PRÉVIA: o que seria gerado agora (e o que fica de fora, com motivo).
export async function GET() {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const r = await gerarPreventivas({ empresaId: auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID, previa: true });
  return NextResponse.json({ data: r.previa ?? [] });
}

// POST /api/pcm/preventivas { planoAtivoIds: string[] } — gera só as escolhidas na prévia
// (o cron diário gera todas, de todas as empresas).
export async function POST(req: NextRequest) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const somente: string[] = Array.isArray(b.planoAtivoIds) ? b.planoAtivoIds.filter((x: unknown) => typeof x === "string") : [];
  if (!somente.length) return NextResponse.json({ error: "Escolha ao menos uma preventiva." }, { status: 400 });
  const r = await gerarPreventivas({ empresaId: auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID, usuario: auth.session.nome, somente });
  return NextResponse.json({ data: r });
}
