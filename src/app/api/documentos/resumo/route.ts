export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { faltaValidade, podeVerDocumento, statusDerivado } from "@/lib/documentos";

// GET — selos do acervo (empresa ativa, só o que o usuário pode ver):
// vencidos, vencem em breve, em renovação, falta validade e total.
export async function GET() {
  const auth = await requireModulo("documentos");
  if (!auth.ok) return auth.response;
  const docs = await prisma.documento.findMany({
    select: {
      status: true, validade: true, diasAlerta: true, confidencial: true, responsavelId: true,
      acessos: { select: { usuarioId: true } },
      categoria: { select: { diasAlerta: true, exigeValidade: true } },
    },
  });
  const out = { VENCIDO: 0, VENCE_EM_BREVE: 0, EM_RENOVACAO: 0, FALTA_VALIDADE: 0, total: 0 };
  for (const d of docs) {
    if (!podeVerDocumento(auth.session, d)) continue;
    out.total++;
    const st = statusDerivado(d.status, d.validade, d.diasAlerta ?? d.categoria.diasAlerta);
    if (st === "VENCIDO" || st === "VENCE_EM_BREVE" || st === "EM_RENOVACAO") out[st]++;
    if (faltaValidade(d, d.categoria.exigeValidade)) out.FALTA_VALIDADE++;
  }
  return NextResponse.json({ data: out });
}
