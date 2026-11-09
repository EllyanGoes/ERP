export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { ErroCompras, submeterCotacaoParaAprovacao } from "@/lib/compras-fluxo";

// POST /api/suprimentos/cotacoes/[id]/submeter-aprovacao
// O comprador envia a cotação para aprovação do gerente, que aprova pela tela
// Aprovações (canal remoto) ou direto na cotação (ADMIN/aprovador).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const { semAprovador } = await submeterCotacaoParaAprovacao({
      cotacaoId: params.id,
      usuarioId: auth.session.sub,
      cfId: body.cfId as string | undefined,
    });
    return NextResponse.json({ ok: true, semAprovador });
  } catch (e: unknown) {
    const status = e instanceof ErroCompras ? e.status : 400;
    const msg = e instanceof Error ? e.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status });
  }
}
