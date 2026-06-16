export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { empresasDoGrupo } from "@/lib/empresa";

// Lista TODAS as empresas ativas do grupo (sem filtro de permissão). Serve ao
// seletor de "estoque de origem" da venda à ordem, onde o vendedor pode acionar
// o estoque de outra empresa do grupo mesmo sem ter acesso a ela.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const data = await empresasDoGrupo();
  return NextResponse.json({ data });
}
