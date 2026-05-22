export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/** Returns all active ADMIN users — used as approver selector in approval workflows */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const users = await prisma.usuario.findMany({
    where: { perfil: "ADMIN", ativo: true },
    select: {
      id: true, nome: true, email: true, telefone: true,
      colaborador: { select: { telegramChatId: true } },
    },
    orderBy: { nome: "asc" },
  });

  return NextResponse.json(users.map((u) => ({
    id:             u.id,
    nome:           u.nome,
    email:          u.email,
    telefone:       u.telefone,
    telegramChatId: u.colaborador?.telegramChatId ?? null,
  })));
}
