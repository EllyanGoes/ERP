export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { nivelNoProjeto, podeEditarTarefas } from "@/lib/projetos";

// POST /api/projetos/[id]/etiquetas — criação inline (qualquer membro).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const acesso = await nivelNoProjeto(auth.session, params.id);
  if (!acesso) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  if (!podeEditarTarefas(acesso.nivel)) return NextResponse.json({ error: "Sem permissão neste projeto." }, { status: 403 });

  const body = await req.json();
  const nome = String(body.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "Informe o nome da etiqueta." }, { status: 400 });

  const existente = await prismaSemEscopo.projetoEtiqueta.findFirst({
    where: { projetoId: params.id, nome: { equals: nome, mode: "insensitive" } },
  });
  if (existente) return NextResponse.json({ data: existente });

  const etiqueta = await prisma.projetoEtiqueta.create({
    data: { projetoId: params.id, nome, cor: body.cor || "#64748b" },
  });
  return NextResponse.json({ data: etiqueta }, { status: 201 });
}
