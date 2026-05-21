export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const where = session.perfil === "ADMIN" ? {} : { usuarioId: session.sub };

  const tickets = await prisma.supportTicket.findMany({
    where,
    include: {
      usuario: { select: { id: true, nome: true, email: true } },
      respondidoPor: { select: { id: true, nome: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: tickets });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { titulo, descricao, tipo, prioridade, imagemUrl, imagemNome } = body;

  if (!titulo?.trim()) return NextResponse.json({ error: "Título é obrigatório" }, { status: 400 });
  if (!descricao?.trim()) return NextResponse.json({ error: "Descrição é obrigatória" }, { status: 400 });

  const ticket = await prisma.$transaction(async (tx) => {
    const seq = await tx.sequencia.upsert({
      where: { prefixo: "TKT" },
      create: { prefixo: "TKT", ultimo: 1 },
      update: { ultimo: { increment: 1 } },
    });
    const numero = `TKT-${String(seq.ultimo).padStart(4, "0")}`;

    return tx.supportTicket.create({
      data: {
        numero,
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        tipo: tipo ?? "MELHORIA",
        prioridade: prioridade ?? "MEDIA",
        imagemUrl: imagemUrl ?? null,
        imagemNome: imagemNome ?? null,
        usuarioId: session.sub,
      },
      include: {
        usuario: { select: { id: true, nome: true, email: true } },
      },
    });
  });

  return NextResponse.json({ data: ticket }, { status: 201 });
}
