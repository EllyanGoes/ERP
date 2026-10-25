export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { dadosOSPublica } from "@/lib/manutencao/os-publica";

// GET /api/publico/os/[token] — dados da página pública da OS (link enviado por
// WhatsApp). SEM sessão de propósito (liberado no middleware): o token aleatório
// de 32 hex é a "chave" do link. Só leitura, sem custos/valores e só o primeiro
// nome das pessoas (ver lib/manutencao/os-publica.ts).
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const data = await dadosOSPublica(params.token);
  if (!data) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });
  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
}
