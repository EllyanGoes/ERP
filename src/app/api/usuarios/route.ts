export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// Returns a lightweight list of users — accessible to any authenticated user
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const users = await prisma.usuario.findMany({
    select: { id: true, nome: true, email: true, perfil: true },
    orderBy: { nome: "asc" },
  });

  return NextResponse.json({ data: users });
}
