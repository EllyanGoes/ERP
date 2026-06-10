export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// Empresas do grupo (multiempresa). Restrito a ADMIN — é o cadastro-mestre
// dos tenants, não confundir com /api/empresa (dados da empresa na cotação).
export async function GET() {
  const session = await getSession();
  if (!session || session.perfil !== "ADMIN") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }
  const empresas = await prismaSemEscopo.empresa.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      razaoSocial: true,
      nomeFantasia: true,
      cnpj: true,
      ie: true,
      slug: true,
      ativo: true,
      email: true,
      telefone: true,
      cidade: true,
      estado: true,
      clienteId: true,
      fornecedorId: true,
    },
  });
  return NextResponse.json({ data: empresas });
}
