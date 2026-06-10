export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

type Params = { params: { id: string; fornId: string; anexoId: string } };

export async function DELETE(_: NextRequest, { params }: Params) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  const anexo = await prisma.anexoCotacaoFornecedor.findUnique({
    where: { id: params.anexoId },
  });
  if (!anexo) return NextResponse.json({ error: "Anexo não encontrado" }, { status: 404 });

  // Delete from Vercel Blob
  await del(anexo.url);

  await prisma.anexoCotacaoFornecedor.delete({ where: { id: params.anexoId } });

  return NextResponse.json({ ok: true });
}
