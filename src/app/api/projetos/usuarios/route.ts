export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

// Lookup de usuários ativos p/ membros/responsáveis de projeto (só id+nome —
// não expõe e-mail/perfil; exige o módulo projetos).
export async function GET() {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;

  const usuarios = await prismaSemEscopo.usuario.findMany({
    where: { ativo: true },
    select: { id: true, nome: true, convidado: true },
    orderBy: { nome: "asc" },
  });
  return NextResponse.json({ data: usuarios });
}

// POST — cria um membro CONVIDADO (pessoa sem usuário no sistema): entra nos
// pickers de membro/responsável, mas nunca faz login (flag convidado + senha
// aleatória). Quando a pessoa ganhar acesso de verdade, o admin edita o
// usuário (e-mail/senha) e desliga a flag.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const nome = String(body?.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "Informe o nome do convidado." }, { status: 400 });

  const jaExiste = await prismaSemEscopo.usuario.findFirst({
    where: { nome: { equals: nome, mode: "insensitive" }, ativo: true },
    select: { id: true, nome: true },
  });
  if (jaExiste) return NextResponse.json({ data: jaExiste });

  const usuario = await prismaSemEscopo.usuario.create({
    data: {
      nome,
      email: `convidado-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@interno.local`,
      senha: await hashPassword(`convidado-${Math.random().toString(36)}${Date.now()}`),
      perfil: "USUARIO",
      convidado: true,
    },
    select: { id: true, nome: true },
  });
  return NextResponse.json({ data: usuario }, { status: 201 });
}
