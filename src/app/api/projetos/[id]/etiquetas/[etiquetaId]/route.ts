export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { nivelNoProjeto, podeGerenciarProjeto } from "@/lib/projetos";

export async function PATCH(req: NextRequest, { params }: { params: { id: string; etiquetaId: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const acesso = await nivelNoProjeto(auth.session, params.id);
  if (!acesso) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  if (!podeGerenciarProjeto(acesso.nivel)) return NextResponse.json({ error: "Apenas dono/administradores editam etiquetas." }, { status: 403 });

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.nome !== undefined) {
    const nome = String(body.nome).trim();
    if (!nome) return NextResponse.json({ error: "Informe o nome." }, { status: 400 });
    data.nome = nome;
  }
  if (body.cor !== undefined) data.cor = body.cor || "#64748b";

  const r = await prisma.projetoEtiqueta.updateMany({ where: { id: params.etiquetaId, projetoId: params.id }, data });
  if (r.count === 0) return NextResponse.json({ error: "Etiqueta não encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string; etiquetaId: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const acesso = await nivelNoProjeto(auth.session, params.id);
  if (!acesso) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  if (!podeGerenciarProjeto(acesso.nivel)) return NextResponse.json({ error: "Apenas dono/administradores editam etiquetas." }, { status: 403 });

  await prismaSemEscopo.projetoEtiqueta.deleteMany({ where: { id: params.etiquetaId, projetoId: params.id } });
  return NextResponse.json({ ok: true });
}
