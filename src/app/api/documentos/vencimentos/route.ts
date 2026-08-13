export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { DOCUMENTO_LISTA_SELECT, podeVerDocumento, statusDerivado } from "@/lib/documentos";

// GET — agenda: vencidos + próximos 90 dias (empresa ativa)
export async function GET() {
  const auth = await requireModulo("documentos");
  if (!auth.ok) return auth.response;

  const limite = new Date();
  limite.setDate(limite.getDate() + 90);

  const documentos = await prisma.documento.findMany({
    where: { validade: { not: null, lte: limite }, status: { not: "ARQUIVADO" } },
    select: DOCUMENTO_LISTA_SELECT,
    orderBy: { validade: "asc" },
  });

  const visiveis = documentos
    .filter((d) => podeVerDocumento(auth.session, d))
    .map((d) => ({
      ...d,
      status: statusDerivado(d.status, d.validade, d.diasAlerta ?? d.categoria.diasAlerta),
      acessos: undefined,
    }));
  return NextResponse.json({ data: visiveis });
}
