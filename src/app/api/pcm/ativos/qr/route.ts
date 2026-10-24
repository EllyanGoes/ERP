export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { novoQrToken } from "@/lib/manutencao/publico";

// GET /api/pcm/ativos/qr — código da etiqueta (qrToken) de cada ativo da empresa,
// para a tela de Etiquetas QR montar o link público /ativo/<qrToken>. Ativo
// criado depois da migration (sem código) ganha um aqui, na primeira impressão.
export async function GET() {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const ativos = await prisma.manutAtivo.findMany({ where: { ativo: true }, select: { id: true, qrToken: true } });
  const data: Record<string, string> = {};
  for (const a of ativos) {
    let token = a.qrToken;
    if (!token) {
      token = novoQrToken();
      await prisma.manutAtivo.update({ where: { id: a.id }, data: { qrToken: token } });
    }
    data[a.id] = token;
  }
  return NextResponse.json({ data });
}
