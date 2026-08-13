export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { nivelNoProjeto, podeGerenciarProjeto, TAREFA_LISTA_SELECT } from "@/lib/projetos";
import { salvarNaLixeira } from "@/lib/lixeira";

// GET /api/projetos/[id] — payload completo do quadro (todas as visões).
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const acesso = await nivelNoProjeto(auth.session, params.id);
  if (!acesso) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });

  const projeto = await prismaSemEscopo.projeto.findUnique({
    where: { id: params.id },
    select: {
      id: true, nome: true, descricao: true, cor: true, icone: true,
      visibilidade: true, status: true, donoId: true,
      // Sem estes dois o diálogo de configurações abre com "Geral"/"Em
      // andamento" e o salvar SOBRESCREVE o que estava gravado.
      empresaId: true, situacao: true,
      dono: { select: { id: true, nome: true } },
      membros: {
        select: { id: true, usuarioId: true, papel: true, favorito: true, usuario: { select: { id: true, nome: true, email: true } } },
        orderBy: { usuario: { nome: "asc" } },
      },
      etiquetas: { select: { id: true, nome: true, cor: true }, orderBy: { nome: "asc" } },
      colunas: {
        where: { arquivada: false },
        orderBy: { ordem: "asc" },
        select: { id: true, nome: true, ordem: true, cor: true, concluiTarefa: true },
      },
      tarefas: {
        where: { arquivada: false },
        orderBy: { ordem: "asc" },
        select: TAREFA_LISTA_SELECT,
      },
    },
  });
  if (!projeto) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });

  return NextResponse.json({
    data: {
      ...projeto,
      tarefas: projeto.tarefas.map((t) => ({
        ...t,
        etiquetas: t.etiquetas.map((e) => e.etiqueta),
        membros: t.membros.map((m) => m.usuario),
        checklistFeitos: t.checklist.filter((c) => c.feito).length,
        checklistTotal: t.checklist.length,
        temDescricao: !!t.descricao?.trim(),
        descricao: undefined,
        checklist: undefined,
      })),
      meuNivel: acesso.nivel,
      meuFavorito: projeto.membros.find((m) => m.usuarioId === auth.session.sub)?.favorito ?? false,
    },
  });
}

// PATCH /api/projetos/[id] — editar/arquivar (dono ou ADMIN do projeto).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const acesso = await nivelNoProjeto(auth.session, params.id);
  if (!acesso) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  if (!podeGerenciarProjeto(acesso.nivel)) {
    return NextResponse.json({ error: "Apenas o dono ou administradores do projeto podem editá-lo." }, { status: 403 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.nome !== undefined) {
    const nome = String(body.nome).trim();
    if (!nome) return NextResponse.json({ error: "Informe o nome do projeto." }, { status: 400 });
    data.nome = nome;
  }
  if (body.descricao !== undefined) data.descricao = body.descricao?.trim() || null;
  // Projeto por empresa (ou geral, null) — tag/filtro na home.
  if (body.empresaId !== undefined) data.empresaId = body.empresaId || null;
  // Situação de andamento (badge).
  if (body.situacao !== undefined && ["NAO_INICIADO", "EM_ANDAMENTO", "PAUSADO", "CONCLUIDO"].includes(body.situacao)) {
    data.situacao = body.situacao;
  }
  if (body.cor !== undefined) data.cor = body.cor || null;
  if (body.icone !== undefined) data.icone = body.icone || null;
  if (body.visibilidade !== undefined) data.visibilidade = body.visibilidade === "PUBLICO" ? "PUBLICO" : "PRIVADO";
  if (body.status !== undefined) {
    if (acesso.nivel !== "DONO") return NextResponse.json({ error: "Apenas o dono pode arquivar/reativar o projeto." }, { status: 403 });
    data.status = body.status === "ARQUIVADO" ? "ARQUIVADO" : "ATIVO";
  }

  const projeto = await prisma.projeto.update({ where: { id: params.id }, data, select: { id: true } });
  return NextResponse.json({ data: projeto });
}

// DELETE /api/projetos/[id] — exclusão real (só dono), com snapshot na Lixeira.
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const acesso = await nivelNoProjeto(auth.session, params.id);
  if (!acesso) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  if (acesso.nivel !== "DONO") {
    return NextResponse.json({ error: "Apenas o dono pode excluir o projeto." }, { status: 403 });
  }

  const snapshot = await prismaSemEscopo.projeto.findUnique({
    where: { id: params.id },
    include: {
      membros: true,
      etiquetas: true,
      colunas: true,
      tarefas: { include: { checklist: true, comentarios: true, anexos: true, etiquetas: true } },
    },
  });

  await prismaSemEscopo.$transaction(async (tx) => {
    await salvarNaLixeira(tx, {
      // Projetos são do grupo — a Lixeira exige empresa; usa a ativa da sessão.
      empresaId: auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID,
      tipo: "PROJETO",
      origemId: params.id,
      descricao: `Projeto: ${snapshot?.nome ?? params.id}`,
      snapshot,
      apagadoPor: auth.session.nome,
    });
    await tx.projeto.delete({ where: { id: params.id } }); // cascata apaga filhos
  });

  return NextResponse.json({ ok: true });
}
