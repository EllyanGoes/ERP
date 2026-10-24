export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { dadosAtivoPublico } from "@/lib/manutencao/publico";

// GET /api/publico/ativo/[token] — dados da página pública do ativo (etiqueta QR).
// SEM sessão de propósito (liberado no middleware): o token aleatório de 32 hex
// é a "chave" da etiqueta. Só o necessário para a página — sem custos, nomes de
// pessoas ou ids internos (ver lib/manutencao/publico.ts).
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const data = await dadosAtivoPublico(params.token);
  if (!data) return NextResponse.json({ error: "Etiqueta inválida ou desativada." }, { status: 404 });
  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
}
