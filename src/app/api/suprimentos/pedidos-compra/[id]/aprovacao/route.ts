export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { responderAprovacaoPedido } from "@/lib/aprovacao-pedido";

// POST /api/suprimentos/pedidos-compra/[id]/aprovacao { acao: APROVAR|REPROVAR, observacao? }
// Decisão da re-aprovação direto na tela do pedido (aprovador designado ou ADMIN).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  const acao = body.acao;
  if (acao !== "APROVAR" && acao !== "REPROVAR") return NextResponse.json({ error: "acao deve ser APROVAR ou REPROVAR" }, { status: 400 });
  try {
    const out = await responderAprovacaoPedido({
      pedidoId: params.id,
      acao,
      observacao: typeof body.observacao === "string" ? body.observacao : null,
      respondente: { id: auth.session.sub, nome: auth.session.nome, perfil: auth.session.perfil },
    });
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao responder" }, { status: 400 });
  }
}
