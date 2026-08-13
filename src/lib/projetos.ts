// Gestão de Projetos — acesso por membro e helpers compartilhados.
// Projetos são do GRUPO (sem empresaId; ficam fora do escopo automático).
// Visibilidade: PRIVADO = só membros; PUBLICO = leitura p/ qualquer usuário com
// o módulo. Edição = dono, membro ADMIN do projeto ou membro comum (tarefas);
// gestão de estrutura (colunas/etiquetas/membros) = dono/ADMIN do projeto.
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { notificarUsuario } from "@/lib/notificacoes";
import type { SessionPayload } from "@/lib/auth";

export type NivelProjeto = "DONO" | "ADMIN" | "MEMBRO" | "LEITURA";

/**
 * Resolve o nível de acesso do usuário num projeto. Retorna null se o projeto
 * não existe ou o usuário não pode nem ver. Perfil ADMIN do ERP → DONO.
 */
export async function nivelNoProjeto(
  session: Pick<SessionPayload, "sub" | "perfil">,
  projetoId: string,
): Promise<{ nivel: NivelProjeto; projeto: { id: string; nome: string; status: string; donoId: string } } | null> {
  const projeto = await prismaSemEscopo.projeto.findUnique({
    where: { id: projetoId },
    select: {
      id: true, nome: true, status: true, donoId: true, visibilidade: true,
      membros: { where: { usuarioId: session.sub }, select: { papel: true } },
    },
  });
  if (!projeto) return null;
  const base = { id: projeto.id, nome: projeto.nome, status: projeto.status, donoId: projeto.donoId };
  if (session.perfil === "ADMIN" || projeto.donoId === session.sub) return { nivel: "DONO", projeto: base };
  const membro = projeto.membros[0];
  if (membro) return { nivel: membro.papel === "ADMIN" ? "ADMIN" : "MEMBRO", projeto: base };
  if (projeto.visibilidade === "PUBLICO") return { nivel: "LEITURA", projeto: base };
  return null;
}

export const podeEditarTarefas = (nivel: NivelProjeto) => nivel !== "LEITURA";
export const podeGerenciarProjeto = (nivel: NivelProjeto) => nivel === "DONO" || nivel === "ADMIN";

/** Feed de atividade (best-effort — nunca derruba a operação principal). */
export async function registrarAtividade(entrada: {
  projetoId: string;
  tarefaId?: string | null;
  autorId: string;
  tipo: string; // CRIOU | MOVEU | ATRIBUIU | COMENTOU | CONCLUIU | REABRIU | PRAZO | EDITOU | ARQUIVOU | ...
  detalhe?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prismaSemEscopo.tarefaAtividade.create({
      data: {
        projetoId: entrada.projetoId,
        tarefaId: entrada.tarefaId ?? null,
        autorId: entrada.autorId,
        tipo: entrada.tipo,
        detalhe: entrada.detalhe ? JSON.parse(JSON.stringify(entrada.detalhe)) : undefined,
      },
    });
  } catch (e) {
    console.warn("[projetos] registrarAtividade falhou (segue):", e);
  }
}

/** Notifica atribuição de tarefa (não notifica auto-atribuição). */
export async function notificarAtribuicao(opts: {
  responsavelId: string | null | undefined;
  autorId: string;
  autorNome: string;
  tarefaId: string;
  tarefaTitulo: string;
  projetoId: string;
  projetoNome: string;
}): Promise<void> {
  if (!opts.responsavelId || opts.responsavelId === opts.autorId) return;
  await notificarUsuario({
    usuarioId: opts.responsavelId,
    tipo: "PROJETO_TAREFA_ATRIBUIDA",
    titulo: `Tarefa atribuída — ${opts.projetoNome}`,
    mensagem: `${opts.autorNome} atribuiu a você: "${opts.tarefaTitulo}"`,
    link: `/projetos/${opts.projetoId}?tarefa=${opts.tarefaId}`,
  });
}

/**
 * @menções em comentários: resolve "@Nome Sobrenome" ou "@email" contra os
 * membros do projeto e notifica os mencionados (menos o autor).
 */
export async function notificarMencoes(opts: {
  texto: string;
  autorId: string;
  autorNome: string;
  tarefaId: string;
  tarefaTitulo: string;
  projetoId: string;
  projetoNome: string;
}): Promise<void> {
  if (!opts.texto.includes("@")) return;
  const membros = await prismaSemEscopo.projetoMembro.findMany({
    where: { projetoId: opts.projetoId },
    select: { usuario: { select: { id: true, nome: true, email: true } } },
  });
  const textoLower = opts.texto.toLowerCase();
  const notificados = new Set<string>();
  for (const { usuario } of membros) {
    if (usuario.id === opts.autorId || notificados.has(usuario.id)) continue;
    const alvoNome = `@${usuario.nome.toLowerCase()}`;
    const alvoEmail = `@${usuario.email.toLowerCase()}`;
    const primeiroNome = `@${usuario.nome.split(" ")[0]?.toLowerCase()}`;
    if (textoLower.includes(alvoNome) || textoLower.includes(alvoEmail) || textoLower.includes(primeiroNome)) {
      notificados.add(usuario.id);
      await notificarUsuario({
        usuarioId: usuario.id,
        tipo: "PROJETO_MENCAO",
        titulo: `Você foi mencionado — ${opts.projetoNome}`,
        mensagem: `${opts.autorNome} mencionou você em "${opts.tarefaTitulo}"`,
        link: `/projetos/${opts.projetoId}?tarefa=${opts.tarefaId}`,
      });
    }
  }
}

/** Espaçamento padrão do campo `ordem` (drag & drop com folga p/ inserção). */
export const ORDEM_GAP = 1024;

/**
 * Renormaliza a ordem das tarefas de uma coluna (1024, 2048, ...). Chamada
 * quando o drag esgota a folga entre vizinhos. Roda fora de transação — a
 * ordenação relativa é preservada.
 */
export async function renormalizarColuna(colunaId: string): Promise<void> {
  const tarefas = await prismaSemEscopo.tarefa.findMany({
    where: { colunaId, arquivada: false },
    orderBy: { ordem: "asc" },
    select: { id: true },
  });
  await prismaSemEscopo.$transaction(
    tarefas.map((t, i) =>
      prismaSemEscopo.tarefa.update({ where: { id: t.id }, data: { ordem: (i + 1) * ORDEM_GAP } }),
    ),
  );
}

/** Payload padrão da tarefa nas listagens (board/lista/minhas-tarefas). */
export const TAREFA_LISTA_SELECT = {
  id: true, projetoId: true, colunaId: true, titulo: true, descricao: true, ordem: true,
  prioridade: true, prazo: true, dataInicio: true, concluidaEm: true, arquivada: true,
  membros: { select: { usuario: { select: { id: true, nome: true } } } },
  etiquetas: { select: { etiqueta: { select: { id: true, nome: true, cor: true } } } },
  _count: { select: { comentarios: true, anexos: true, checklist: true } },
  checklist: { select: { feito: true } },
} as const;

// prisma é reexportado p/ as rotas do módulo usarem o client com autoria
// carimbada (proxy) mesmo sendo modelos sem escopo de empresa.
export { prisma as prismaProjetos };
