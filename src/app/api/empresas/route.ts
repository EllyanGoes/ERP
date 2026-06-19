export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

// Lista enxuta das empresas do grupo (id + nome) para seletores — ex.: empresas
// do colaborador. Basta estar autenticado (não é o cadastro-mestre admin).
export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const empresas = await prismaSemEscopo.empresa.findMany({
    where: { ativo: true },
    orderBy: { razaoSocial: "asc" },
    select: { id: true, razaoSocial: true, nomeFantasia: true },
  });
  return NextResponse.json(empresas);
}
