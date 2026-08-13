export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";

// Lookup de usuários ativos p/ membros/responsáveis de projeto (só id+nome —
// não expõe e-mail/perfil; exige o módulo projetos).
export async function GET() {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;

  const usuarios = await prismaSemEscopo.usuario.findMany({
    where: { ativo: true },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });
  return NextResponse.json({ data: usuarios });
}
