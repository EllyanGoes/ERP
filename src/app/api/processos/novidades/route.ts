export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { filtroVisibilidade } from "@/lib/processos";

// GET — "Novidades dos tribunais": andamentos importantes capturados do DataJud nos últimos 7 dias,
// (movimento recente — o histórico da 1ª captura não entra), só de processos visíveis ao usuário (confidencial segue a mesma regra da lista).
export async function GET() {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  const visivel = await filtroVisibilidade(auth.session);
  const desde = new Date(Date.now() - 7 * 86_400_000);
  const processos = await prisma.processo.findMany({ where: { AND: [visivel] }, select: { id: true } });
  const data = await prisma.processoAndamento.findMany({
    where: { processoId: { in: processos.map((p) => p.id) }, origem: "DATAJUD", importancia: "ALTA", createdAt: { gte: desde }, data: { gte: new Date(Date.now() - 14 * 86_400_000) } },
    orderBy: [{ data: "desc" }, { createdAt: "desc" }],
    take: 30,
    select: { id: true, data: true, descricao: true, resumoIa: true, processo: { select: { id: true, codigo: true, titulo: true } } },
  });
  return NextResponse.json({ data });
}
