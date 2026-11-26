export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { podeVerDocumento } from "@/lib/documentos";

// POST { favorito?: boolean } — estrela do usuário logado. Sem corpo = alterna.
// → { data: { favorito } }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("documentos");
  if (!auth.ok) return auth.response;
  const doc = await prismaSemEscopo.documento.findUnique({
    where: { id: params.id },
    select: { id: true, confidencial: true, responsavelId: true, acessos: { select: { usuarioId: true } } },
  });
  if (!doc || !podeVerDocumento(auth.session, doc)) {
    return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const chave = { usuarioId_documentoId: { usuarioId: auth.session.sub, documentoId: doc.id } };
  const atual = await prismaSemEscopo.documentoFavorito.findUnique({ where: chave, select: { usuarioId: true } });
  const quer = typeof body.favorito === "boolean" ? body.favorito : !atual;
  if (quer && !atual) {
    await prismaSemEscopo.documentoFavorito.create({ data: { usuarioId: auth.session.sub, documentoId: doc.id } }).catch(() => {});
  } else if (!quer && atual) {
    await prismaSemEscopo.documentoFavorito.delete({ where: chave }).catch(() => {});
  }
  return NextResponse.json({ data: { favorito: quer } });
}
