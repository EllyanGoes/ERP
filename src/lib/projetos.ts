// Gestão de Projetos — acesso por membro e helpers compartilhados.
// Projetos são do GRUPO (sem empresaId; ficam fora do escopo automático).
// Visibilidade: PRIVADO = só membros; PUBLICO = leitura p/ qualquer usuário com
// o módulo. Edição = dono, membro ADMIN do projeto ou membro comum (tarefas);
// gestão de estrutura (colunas/etiquetas/membros) = dono/ADMIN do projeto.
import { createHmac, timingSafeEqual } from "crypto";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { notificarUsuario } from "@/lib/notificacoes";
import type { SessionPayload } from "@/lib/auth";

export type NivelProjeto = "DONO" | "ADMIN" | "MEMBRO" | "LEITURA";

/**
 * Token do feed ICS da Agenda: HMAC do id do usuário com o JWT_SECRET. Apps de
 * calendário (Mac/Google) assinam a URL sem cookie de sessão — o link carrega
 * a própria autenticação, revogável trocando o segredo.
 */
export function tokenFeedAgenda(usuarioId: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET não configurado — defina a variável de ambiente.");
  return createHmac("sha256", secret).update(`agenda-ics:${usuarioId}`).digest("hex");
}

export function tokenFeedAgendaValido(usuarioId: string, token: string): boolean {
  const esperado = Buffer.from(tokenFeedAgenda(usuarioId));
  const recebido = Buffer.from(token);
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

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
/** Valida "HH:MM" (hora do prazo). Devolve a string normalizada ou null. */
export function normalizarHora(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1]), mi = parseInt(m[2]);
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** Campos do item da caixa de entrada pessoal (TarefaInbox). */
export const INBOX_SELECT = {
  id: true, titulo: true, notas: true, ordem: true, concluidaEm: true, createdAt: true,
} as const;

export const TAREFA_LISTA_SELECT = {
  id: true, projetoId: true, colunaId: true, titulo: true, descricao: true, ordem: true,
  prioridade: true, prazo: true, prazoHora: true, dataInicio: true, concluidaEm: true, arquivada: true,
  membros: { select: { usuario: { select: { id: true, nome: true } } } },
  etiquetas: { select: { etiqueta: { select: { id: true, nome: true, cor: true } } } },
  _count: { select: { comentarios: true, anexos: true, checklist: true } },
  checklist: { select: { feito: true } },
} as const;

// prisma é reexportado p/ as rotas do módulo usarem o client com autoria
// carimbada (proxy) mesmo sendo modelos sem escopo de empresa.
export { prisma as prismaProjetos };

// ── Cronograma: dependências e propagação de datas ───────────────────────────
export type ConfigCronograma = {
  dependencias: boolean;
  // Ao mover a predecessora: MARGEM só empurra a sucessora se ela passar a
  // começar antes do fim da predecessora; MANTER desloca a sucessora pelo mesmo
  // delta (preserva o espaço entre elas); NAO não mexe.
  modoDatas: "MARGEM" | "MANTER" | "NAO";
  evitarFds: boolean;
};
export const CRONOGRAMA_PADRAO: ConfigCronograma = { dependencias: false, modoDatas: "MARGEM", evitarFds: true };

export function lerConfigCronograma(v: unknown): ConfigCronograma {
  const o = (v && typeof v === "object" ? v : {}) as Partial<ConfigCronograma>;
  return {
    dependencias: !!o.dependencias,
    modoDatas: o.modoDatas === "MANTER" || o.modoDatas === "NAO" ? o.modoDatas : "MARGEM",
    evitarFds: o.evitarFds !== false,
  };
}

const DIA_MS = 86_400_000;
const somaDiasUtc = (d: Date, n: number) => new Date(d.getTime() + n * DIA_MS);
// Datas de tarefa são meia-noite UTC (só o dia): fim de semana pelo getUTCDay.
function pularFds(d: Date, evitar: boolean): Date {
  if (!evitar) return d;
  let x = d;
  while (x.getUTCDay() === 0 || x.getUTCDay() === 6) x = somaDiasUtc(x, 1);
  return x;
}

/**
 * Empurra as tarefas que dependem de `tarefaId` quando as datas dela mudaram.
 * `fimAnterior` é o prazo que ela tinha antes (para o modo MANTER). Cascateia
 * pelas sucessoras das sucessoras; ciclos são cortados pelo `visitados`.
 */
export async function propagarDependencias(tarefaId: string, fimAnterior: Date | null, visitados = new Set<string>()): Promise<string[]> {
  if (visitados.has(tarefaId)) return [];
  visitados.add(tarefaId);
  const pred = await prismaSemEscopo.tarefa.findUnique({
    where: { id: tarefaId },
    select: { prazo: true, dataInicio: true, projeto: { select: { cronograma: true } } },
  });
  if (!pred) return [];
  const cfg = lerConfigCronograma(pred.projeto.cronograma);
  if (!cfg.dependencias || cfg.modoDatas === "NAO") return [];
  const fimPred = pred.prazo ?? pred.dataInicio;
  if (!fimPred) return [];
  const deltaDias = fimAnterior ? Math.round((fimPred.getTime() - fimAnterior.getTime()) / DIA_MS) : 0;

  const sucessoras = await prismaSemEscopo.tarefaDependencia.findMany({
    where: { dependeDeId: tarefaId },
    select: { tarefa: { select: { id: true, dataInicio: true, prazo: true } } },
  });
  const alteradas: string[] = [];
  for (const { tarefa: suc } of sucessoras) {
    const fimSuc = suc.prazo ?? suc.dataInicio;
    if (!fimSuc) continue;
    const iniSuc = suc.dataInicio ?? fimSuc;
    const duracao = Math.round((fimSuc.getTime() - iniSuc.getTime()) / DIA_MS);
    let novoIni: Date | null = null;
    if (cfg.modoDatas === "MANTER") {
      if (deltaDias !== 0) novoIni = somaDiasUtc(iniSuc, deltaDias);
    } else {
      const minimo = somaDiasUtc(fimPred, 1);
      if (iniSuc < minimo) novoIni = minimo;
    }
    if (!novoIni) continue;
    novoIni = pularFds(novoIni, cfg.evitarFds);
    const novoFim = pularFds(somaDiasUtc(novoIni, duracao), cfg.evitarFds);
    await prismaSemEscopo.tarefa.update({
      where: { id: suc.id },
      data: { dataInicio: suc.dataInicio ? novoIni : null, prazo: novoFim },
    });
    alteradas.push(suc.id);
    alteradas.push(...(await propagarDependencias(suc.id, fimSuc, visitados)));
  }
  return alteradas;
}
