export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { fecharFolha } from "@/lib/folha";

// POST /api/rh/folhas/[id]/fechar — apropria a folha e gera as Contas a Pagar.
export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;
  if (auth.session.perfil !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores podem fechar a folha" }, { status: 403 });
  }
  try {
    await fecharFolha(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao fechar a folha";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
