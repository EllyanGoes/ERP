export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";

// GET /api/processos/lookups — usuários (responsável) e documentos do GED sem processo (para ligar).
export async function GET() {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  const [usuarios, documentos] = await Promise.all([
    prismaSemEscopo.usuario.findMany({ where: { ativo: true, convidado: false }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.documento.findMany({ where: { processoId: null }, orderBy: { createdAt: "desc" }, take: 500, select: { id: true, titulo: true, categoria: { select: { nome: true } } } }),
  ]);
  return NextResponse.json({ data: { usuarios, documentos } });
}
