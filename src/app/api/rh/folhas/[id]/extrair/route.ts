export const dynamic = "force-dynamic";
export const maxDuration = 120;
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { extrairFolhaPdf } from "@/lib/folha";

// POST /api/rh/folhas/[id]/extrair — roda a IA sobre o PDF e popula os itens.
export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;
  try {
    const res = await extrairFolhaPdf(params.id);
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha na extração";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
