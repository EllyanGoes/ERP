export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const usuarios = await prisma.usuario.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, email: true, telefone: true },
      orderBy: { nome: "asc" },
    });
    return NextResponse.json({ data: usuarios });
  } catch (err) {
    console.error("[GET /api/configuracoes/usuarios]", err);
    return NextResponse.json({ error: "Erro ao listar usuários" }, { status: 500 });
  }
}
