export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _: NextRequest,
  { params }: { params: { id: string; fornId: string } }
) {
  const historico = await prisma.cotacaoFornecedorHistorico.findMany({
    where: { cotacaoFornecedorId: params.fornId },
    orderBy: { versao: "desc" },
  });
  return NextResponse.json({ data: historico });
}
