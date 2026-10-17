import { prismaSemEscopo } from "@/lib/prisma";
import { notificarUsuario } from "@/lib/notificacoes";
import { sendTelegramDM, escMD } from "@/lib/telegram";

// Exclusão de colaborador sob aprovação. Excluir apaga em cascata ASOs, exames,
// EPIs, função SST, histórico funcional, escalas… (FKs onDelete: Cascade) — em
// 17/10/2026 um cadastro foi apagado por engano e só deu pra reconstruir parte.
// Por isso: quem não é o aprovador só SOLICITA; o aprovador (1ª etapa do fluxo
// EXCLUSAO_COLABORADOR) aprova/reprova em /aprovacoes. Ao executar, o snapshot do
// colaborador e de tudo que a cascata leva fica na SolicitacaoExclusao.

export const ENTIDADE_COLABORADOR = "COLABORADOR";
export const LINK_APROVACOES_EXCLUSAO = "/aprovacoes#exclusoes";

/** Aprovador da exclusão: 1ª etapa do fluxo ativo; sem fluxo, o ADMIN mais antigo. */
export async function aprovadorExclusaoColaborador(): Promise<string | null> {
  const fluxo = await prismaSemEscopo.aprovacaoFluxo.findFirst({
    where: { processo: "EXCLUSAO_COLABORADOR", ativo: true },
    orderBy: { createdAt: "asc" },
    select: { etapas: { orderBy: { ordem: "asc" }, take: 1, select: { aprovadorId: true } } },
  });
  const id = fluxo?.etapas[0]?.aprovadorId;
  if (id) return id;
  const admin = await prismaSemEscopo.usuario.findFirst({ where: { perfil: "ADMIN", ativo: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
  return admin?.id ?? null;
}

// Tabelas apagadas em cascata junto com o colaborador (coluna que aponta p/ ele).
const CASCATA: [string, string][] = [
  ["_ColaboradorEmpresas", "A"], ["_ColaboradorToFilial", "A"], ["ColaboradorEscala", "colaboradorId"],
  ["ColaboradorEvento", "colaboradorId"], ["SstColaboradorFuncao", "colaboradorId"], ["SstAso", "colaboradorId"],
  ["SstExame", "colaboradorId"], ["SstEpiFicha", "colaboradorId"], ["SstEpiEntrega", "colaboradorId"],
  ["SstTreinamentoParticipante", "colaboradorId"], ["SstCipaMembro", "colaboradorId"],
];

/** Foto do colaborador + dependentes que a cascata apaga (p/ reconstrução). */
async function snapshotColaborador(id: string): Promise<Record<string, unknown>> {
  const partes = CASCATA.map(([t, c]) => `'${t}', (select coalesce(json_agg(to_jsonb(x)), '[]'::json) from "${t}" x where x."${c}" = $1)`).join(", ");
  const rows = await prismaSemEscopo.$queryRawUnsafe<{ s: Record<string, unknown> }[]>(
    `select json_build_object('Colaborador', (select to_jsonb(c) from "Colaborador" c where c.id = $1), ${partes},
       'SstAsoExame', (select coalesce(json_agg(to_jsonb(x)), '[]'::json) from "SstAsoExame" x where x."asoId" in (select a.id from "SstAso" a where a."colaboradorId" = $1))) s`,
    id,
  );
  return rows[0]?.s ?? {};
}

export type ResultadoExclusao = { ok: true; snapshot: Record<string, unknown> } | { ok: false; status: number; error: string };

/** Executa a exclusão (com snapshot). Bloqueia se houver aprovação de compras pendente ou vínculo que não cascateia. */
export async function executarExclusaoColaborador(id: string): Promise<ResultadoExclusao> {
  const existe = await prismaSemEscopo.colaborador.findUnique({ where: { id }, select: { id: true } });
  if (!existe) return { ok: false, status: 404, error: "Colaborador não encontrado (já excluído?)" };
  const pend = await prismaSemEscopo.aprovacaoSC.count({ where: { aprovadorId: id, status: "PENDENTE" } });
  if (pend > 0) return { ok: false, status: 409, error: `Colaborador possui ${pend} aprovação(ões) pendente(s)` };
  const snapshot = await snapshotColaborador(id);
  try {
    await prismaSemEscopo.colaborador.delete({ where: { id } });
  } catch (err) {
    if ((err as { code?: string })?.code === "P2003") {
      return { ok: false, status: 409, error: "Colaborador tem diárias ou equipes de OP vinculadas — não pode ser excluído. Inative o cadastro." };
    }
    throw err;
  }
  return { ok: true, snapshot };
}

/** Avisa o aprovador (sino + Telegram, best-effort). */
export async function avisarAprovadorExclusao(aprovadorId: string, nome: string, solicitante: string, motivo: string | null) {
  await notificarUsuario({
    usuarioId: aprovadorId, tipo: "EXCLUSAO_COLABORADOR_SOLICITADA",
    titulo: "Exclusão de colaborador aguardando aprovação",
    mensagem: `${solicitante} pediu para excluir ${nome}${motivo ? ` — ${motivo}` : ""}.`,
    link: LINK_APROVACOES_EXCLUSAO,
  });
  try {
    const u = await prismaSemEscopo.usuario.findUnique({ where: { id: aprovadorId }, select: { colaborador: { select: { telegramChatId: true } } } });
    const chat = u?.colaborador?.telegramChatId;
    if (chat) {
      await sendTelegramDM(chat, { text: `🗑️ *Exclusão de colaborador aguardando aprovação*\n${escMD(solicitante)} pediu para excluir *${escMD(nome)}*${motivo ? `\nMotivo: ${escMD(motivo)}` : ""}\nAprove ou reprove em Minhas Aprovações.` });
    }
  } catch { /* best-effort */ }
}
