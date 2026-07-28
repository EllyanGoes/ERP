export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

type Params = { params: { id: string; anexoId: string } };

/** DELETE — remove o anexo (registro + arquivo no Blob). */
export async function DELETE(_: NextRequest, { params }: Params) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const anexo = await prisma.anexoTitulo.findFirst({
    where: { id: params.anexoId, contaPagarId: params.id },
  });
  if (!anexo) return NextResponse.json({ error: "Anexo não encontrado" }, { status: 404 });

  await del(anexo.url).catch(() => {}); // arquivo já ausente no Blob não trava
  await prisma.anexoTitulo.delete({ where: { id: anexo.id } });
  return NextResponse.json({ ok: true });
}
