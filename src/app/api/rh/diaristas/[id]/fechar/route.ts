export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { fecharDiariaFolha, reabrirDiariaFolha, RhPagamentoErro } from "@/lib/rh-pagamentos";

// POST /api/rh/diaristas/[id]/fechar — fecha a folha de diárias: posta a
// provisão (custeio pela classificação do colaborador contra a conta de cada
// um) e cria o título único no Contas a Pagar (categoria Diárias).
export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;
  try {
    await fecharDiariaFolha(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RhPagamentoErro) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao fechar a folha" }, { status: 500 });
  }
}

// DELETE /api/rh/diaristas/[id]/fechar — reabre (estorna provisão + remove o
// título). Bloqueado se houver pagamento registrado.
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;
  try {
    await reabrirDiariaFolha(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RhPagamentoErro) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao reabrir a folha" }, { status: 500 });
  }
}
