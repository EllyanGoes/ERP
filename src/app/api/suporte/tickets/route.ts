export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { EMPRESA_PADRAO_ID, proximaSequenciaDaEmpresa } from "@/lib/empresa";

export async function GET() {
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

  // Ticket é global (numero único entre empresas): sequência global pelo
  // client cru — pela escopada, a extensão reescreveria para a empresa ativa
  // e cada empresa recomeçaria do TKT-0001, colidindo no unique.
  let numero = "";
  for (let i = 0; i < 50; i++) {
    const n = await proximaSequenciaDaEmpresa(EMPRESA_PADRAO_ID, "TKT");
    const candidato = `TKT-${String(n).padStart(4, "0")}`;
    const existe = await prismaSemEscopo.supportTicket.findUnique({ where: { numero: candidato }, select: { id: true } });
    if (!existe) { numero = candidato; break; }
  }
  if (!numero) return NextResponse.json({ error: "Não foi possível gerar o número do chamado." }, { status: 500 });

  const ticket = await prisma.$transaction(async (tx) => {
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
