export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// Empresa ATIVA da sessão (não a primeira da tabela — findFirst devolvia uma
// empresa arbitrária e vazava dados de outra empresa, ex.: informações de
// entrega da cotação).
export async function GET() {
  const session = await getSession();
  const id = session?.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const empresa = await prisma.empresa.findUnique({ where: { id } });
  return NextResponse.json({ data: empresa ?? null });
}
