export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { nivelNoProjeto, podeGerenciarProjeto } from "@/lib/projetos";

// PATCH /api/projetos/[id]/colunas/[colunaId] — renomear/cor/concluiTarefa/arquivar.
export async function PATCH(req: NextRequest, { params }: { params: { id: string; colunaId: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const acesso = await nivelNoProjeto(auth.session, params.id);
  if (!acesso) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  if (!podeGerenciarProjeto(acesso.nivel)) {
    return NextResponse.json({ error: "Apenas dono/administradores gerenciam colunas." }, { status: 403 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.nome !== undefined) {
    const nome = String(body.nome).trim();
    if (!nome) return NextResponse.json({ error: "Informe o nome da coluna." }, { status: 400 });
    data.nome = nome;
  }
  if (body.cor !== undefined) data.cor = body.cor || null;
  if (body.concluiTarefa !== undefined) data.concluiTarefa = !!body.concluiTarefa;
  if (body.arquivada !== undefined) {
    if (body.arquivada) {
      const abertas = await prismaSemEscopo.tarefa.count({ where: { colunaId: params.colunaId, arquivada: false } });
      if (abertas > 0) {
        return NextResponse.json({ error: `A coluna tem ${abertas} tarefa(s). Mova ou arquive-as antes.` }, { status: 400 });
      }
    }
    data.arquivada = !!body.arquivada;
  }

  const r = await prisma.projetoColuna.updateMany({ where: { id: params.colunaId, projetoId: params.id }, data });
  if (r.count === 0) return NextResponse.json({ error: "Coluna não encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// DELETE — só coluna vazia (sem tarefas nem arquivadas).
export async function DELETE(_: NextRequest, { params }: { params: { id: string; colunaId: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const acesso = await nivelNoProjeto(auth.session, params.id);
  if (!acesso) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  if (!podeGerenciarProjeto(acesso.nivel)) {
    return NextResponse.json({ error: "Apenas dono/administradores gerenciam colunas." }, { status: 403 });
  }

  const total = await prismaSemEscopo.tarefa.count({ where: { colunaId: params.colunaId } });
  if (total > 0) {
    return NextResponse.json({ error: "A coluna tem tarefas (inclusive arquivadas). Use arquivar." }, { status: 400 });
  }
  await prismaSemEscopo.projetoColuna.deleteMany({ where: { id: params.colunaId, projetoId: params.id } });
  return NextResponse.json({ ok: true });
}
