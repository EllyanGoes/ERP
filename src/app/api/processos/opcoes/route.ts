export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModuloAny } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { filtroVisibilidade } from "@/lib/processos";

// GET /api/processos/opcoes — processos visíveis da empresa ativa (abertos e encerrados) para
// droplists de outros módulos (ex.: vincular título do Contas a Pagar/Receber a um processo).
export async function GET() {
  const auth = await requireModuloAny(["processos", "financeiro"]);
  if (!auth.ok) return auth.response;
  const visivel = await filtroVisibilidade(auth.session);
  const data = await prisma.processo.findMany({ where: { AND: [visivel] }, orderBy: { codigo: "desc" }, select: { id: true, codigo: true, titulo: true, situacao: true } });
  return NextResponse.json({ data });
}
