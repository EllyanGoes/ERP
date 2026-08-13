export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { nivelNoProjeto, podeEditarTarefas, registrarAtividade, notificarAtribuicao } from "@/lib/projetos";

async function carregarComAcesso(session: { sub: string; perfil: "ADMIN" | "USUARIO" }, tarefaId: string) {
  const tarefa = await prismaSemEscopo.tarefa.findUnique({
    where: { id: tarefaId },
    select: { id: true, projetoId: true, colunaId: true, titulo: true, prazo: true, arquivada: true, membros: { select: { usuarioId: true } } },
  });
  if (!tarefa) return null;
  const acesso = await nivelNoProjeto(session, tarefa.projetoId);
  if (!acesso) return null;
  return { tarefa, acesso };
}

// GET /api/projetos/tarefas/[tarefaId] — cartão completo.
export async function GET(_: NextRequest, { params }: { params: { tarefaId: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const ctx = await carregarComAcesso(auth.session, params.tarefaId);
  if (!ctx) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });

  const tarefa = await prismaSemEscopo.tarefa.findUnique({
    where: { id: params.tarefaId },
    select: {
      id: true, projetoId: true, colunaId: true, titulo: true, descricao: true,
      prioridade: true, dataInicio: true, prazo: true, concluidaEm: true, arquivada: true,
      criadoPor: true, createdAt: true,
      membros: { select: { usuario: { select: { id: true, nome: true } } } },
      coluna: { select: { id: true, nome: true, concluiTarefa: true } },
      etiquetas: { select: { etiqueta: { select: { id: true, nome: true, cor: true } } } },
      checklist: { orderBy: { ordem: "asc" }, select: { id: true, texto: true, feito: true, ordem: true } },
      comentarios: {
        orderBy: { createdAt: "asc" },
        select: { id: true, texto: true, createdAt: true, editadoEm: true, autor: { select: { id: true, nome: true } } },
      },
      anexos: { orderBy: { createdAt: "desc" }, select: { id: true, nome: true, url: true, tamanho: true, tipo: true, createdAt: true } },
      atividades: {
        orderBy: { createdAt: "desc" }, take: 30,
        select: { id: true, tipo: true, detalhe: true, createdAt: true, autor: { select: { id: true, nome: true } } },
      },
    },
  });
  if (!tarefa) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  return NextResponse.json({
    data: {
      ...tarefa,
      etiquetas: tarefa.etiquetas.map((e) => e.etiqueta),
      membros: tarefa.membros.map((m) => m.usuario),
      meuNivel: ctx.acesso.nivel,
    },
  });
}

// PATCH — edita campos do cartão (menos coluna/ordem, que é /mover).
export async function PATCH(req: NextRequest, { params }: { params: { tarefaId: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const ctx = await carregarComAcesso(auth.session, params.tarefaId);
  if (!ctx) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  if (!podeEditarTarefas(ctx.acesso.nivel)) return NextResponse.json({ error: "Sem permissão neste projeto." }, { status: 403 });

  const body = await req.json();
  const data: Record<string, unknown> = {};
  const atividades: Array<{ tipo: string; detalhe?: Record<string, unknown> }> = [];

  if (body.titulo !== undefined) {
    const t = String(body.titulo).trim();
    if (!t) return NextResponse.json({ error: "Título não pode ficar vazio." }, { status: 400 });
    data.titulo = t;
  }
  if (body.descricao !== undefined) data.descricao = body.descricao?.trim() || null;
  if (body.prioridade !== undefined && ["BAIXA", "MEDIA", "ALTA", "URGENTE"].includes(body.prioridade)) {
    data.prioridade = body.prioridade;
  }
  if (body.dataInicio !== undefined) data.dataInicio = body.dataInicio ? new Date(body.dataInicio) : null;
  if (body.prazo !== undefined) {
    data.prazo = body.prazo ? new Date(body.prazo) : null;
    atividades.push({ tipo: "PRAZO", detalhe: { prazo: body.prazo ?? null } });
  }
  let membrosNovos: string[] = [];
  if (Array.isArray(body.membroIds)) {
    const atuais = new Set(ctx.tarefa.membros.map((m) => m.usuarioId));
    const desejados: string[] = body.membroIds.filter((m: unknown) => typeof m === "string");
    membrosNovos = desejados.filter((id) => !atuais.has(id));
    await prismaSemEscopo.tarefaMembro.deleteMany({ where: { tarefaId: params.tarefaId } });
    if (desejados.length > 0) {
      await prismaSemEscopo.tarefaMembro.createMany({
        data: desejados.map((usuarioId) => ({ tarefaId: params.tarefaId, usuarioId })),
        skipDuplicates: true,
      });
    }
    if (membrosNovos.length > 0) atividades.push({ tipo: "ATRIBUIU", detalhe: { membros: membrosNovos.length } });
  }
  if (body.arquivada !== undefined) {
    data.arquivada = !!body.arquivada;
    atividades.push({ tipo: body.arquivada ? "ARQUIVOU" : "DESARQUIVOU" });
  }
  // Etiquetas: substituição completa { etiquetaIds: [] }
  if (Array.isArray(body.etiquetaIds)) {
    await prismaSemEscopo.tarefaEtiqueta.deleteMany({ where: { tarefaId: params.tarefaId } });
    if (body.etiquetaIds.length > 0) {
      await prismaSemEscopo.tarefaEtiqueta.createMany({
        data: body.etiquetaIds.map((etiquetaId: string) => ({ tarefaId: params.tarefaId, etiquetaId })),
        skipDuplicates: true,
      });
    }
  }

  if (Object.keys(data).length > 0) {
    await prisma.tarefa.update({ where: { id: params.tarefaId }, data });
  }

  for (const a of atividades) {
    await registrarAtividade({ projetoId: ctx.tarefa.projetoId, tarefaId: params.tarefaId, autorId: auth.session.sub, ...a });
  }
  for (const usuarioId of membrosNovos) {
    await notificarAtribuicao({
      responsavelId: usuarioId,
      autorId: auth.session.sub,
      autorNome: auth.session.nome,
      tarefaId: params.tarefaId,
      tarefaTitulo: (data.titulo as string) ?? ctx.tarefa.titulo,
      projetoId: ctx.tarefa.projetoId,
      projetoNome: ctx.acesso.projeto.nome,
    });
  }
  return NextResponse.json({ ok: true });
}

// DELETE — exclusão real: dono/ADMIN do projeto (tarefa some do quadro e das arquivadas).
export async function DELETE(_: NextRequest, { params }: { params: { tarefaId: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const ctx = await carregarComAcesso(auth.session, params.tarefaId);
  if (!ctx) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  if (ctx.acesso.nivel !== "DONO" && ctx.acesso.nivel !== "ADMIN") {
    return NextResponse.json({ error: "Apenas dono/administradores excluem tarefas — use arquivar." }, { status: 403 });
  }
  await prismaSemEscopo.tarefa.delete({ where: { id: params.tarefaId } });
  await registrarAtividade({ projetoId: ctx.tarefa.projetoId, autorId: auth.session.sub, tipo: "EXCLUIU", detalhe: { titulo: ctx.tarefa.titulo } });
  return NextResponse.json({ ok: true });
}
