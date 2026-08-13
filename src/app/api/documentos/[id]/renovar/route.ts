export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { podeVerDocumento, registrarLogDocumento } from "@/lib/documentos";

// POST — marca EM_RENOVACAO (a nova via com validade futura conclui a renovação).
export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("documentos");
  if (!auth.ok) return auth.response;
  const doc = await prismaSemEscopo.documento.findUnique({
    where: { id: params.id },
    include: { acessos: { select: { usuarioId: true } } },
  });
  if (!doc || !podeVerDocumento(auth.session, doc)) {
    return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });
  }
  await prisma.documento.update({ where: { id: params.id }, data: { status: "EM_RENOVACAO" } });
  await registrarLogDocumento(params.id, auth.session.sub, "RENOVOU");
  return NextResponse.json({ ok: true });
}
