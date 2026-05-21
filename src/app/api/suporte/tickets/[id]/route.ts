export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

type Params = { params: { id: string } };

export async function GET(_: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: params.id },
    include: {
      usuario: { select: { id: true, nome: true, email: true } },
      respondidoPor: { select: { id: true, nome: true } },
    },
  });

  if (!ticket) return NextResponse.json({ error: "Ticket não encontrado" }, { status: 404 });

  // Non-admin can only see their own tickets
  if (session.perfil !== "ADMIN" && ticket.usuarioId !== session.sub)
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  return NextResponse.json({ data: ticket });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (session.perfil !== "ADMIN") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const body = await req.json();
  const { status, resposta } = body;

  const ticket = await prisma.supportTicket.update({
    where: { id: params.id },
    data: {
      ...(status !== undefined && { status }),
      ...(resposta !== undefined && { resposta }),
      respondidoPorId: session.sub,
      updatedAt: new Date(),
    },
    include: {
      usuario: { select: { id: true, nome: true, email: true } },
      respondidoPor: { select: { id: true, nome: true } },
    },
  });

  return NextResponse.json({ data: ticket });
}
