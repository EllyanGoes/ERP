export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

// ── ROTA DESATIVADA ───────────────────────────────────────────────────────────
// A aprovação de compras migrou da Solicitação (SC) para a COTAÇÃO: o fluxo é
// SC → cotação → submeter-aprovacao da cotação → aprovação gera o Pedido de
// Compras (uma única aprovação, processo PEDIDO_COMPRAS). Este endpoint criava
// pendências de aprovação direto na SC (com aprovador free-form) e permitia
// contornar o fluxo — foi removido.
// Use: POST /api/suprimentos/cotacoes/[id]/submeter-aprovacao
export async function POST() {
  return NextResponse.json(
    { error: "A aprovação na Solicitação foi descontinuada — a aprovação agora é na cotação (que gera o Pedido de Compras)." },
    { status: 410 },
  );
}
