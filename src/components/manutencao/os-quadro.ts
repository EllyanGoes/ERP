// Tipos e regras de tela do quadro de Ordens de Serviço (/pcm/os).
// As transições espelham o motor (src/lib/manutencao/ordem.ts — ORIGEM/DESTINO),
// que não pode ser importado no cliente; a API continua sendo a palavra final.
import { CheckCircle2, ClipboardCheck, LockOpen, PauseCircle, PlayCircle, CalendarCheck, type LucideIcon } from "lucide-react";

export type OSResumo = {
  id: string; numero: string; status: string; prioridade: string; descricao: string; createdAt: string;
  programadaPara: string | null; prazo: string | null;
  paradaInicio: string | null; paradaFim: string | null; concluidaEm: string | null; encerradaEm: string | null;
  localTexto: string | null; planoId: string | null;
  custoMaoObra: string; custoMaterial: string; custoTerceiros: string;
  ativo: { id: string; tag: string; nome: string } | null;
  tipo: { id: string; sigla: string; nome: string; natureza: string };
  equipe: { id: string; nome: string } | null;
  responsavel: { id: string; nome: string } | null;
  /** Só os apontamentos com cronômetro rodando (fim nulo). */
  apontamentos: { nome: string }[];
  /** Última pausa/espera (motivo) — vem só no essencial. */
  eventos?: { detalhe: string | null }[];
};

export const custoTotalOS = (o: OSResumo) => Number(o.custoMaoObra) + Number(o.custoMaterial) + Number(o.custoTerceiros);

/** Data que posiciona a OS no tempo: programação, senão prazo. */
export const dataReferenciaOS = (o: OSResumo) => o.programadaPara ?? o.prazo;

export function osAtrasada(o: OSResumo): boolean {
  if (["CONCLUIDA", "CANCELADA", "ENCERRADA"].includes(o.status)) return false;
  const ref = o.prazo ?? o.programadaPara;
  return !!ref && new Date(ref) < new Date(new Date().toDateString());
}

// ── Colunas do quadro ──────────────────────────────────────────────────────
export type ColunaOS = { key: string; label: string; status: string[]; cor: string; icon: LucideIcon; corTexto: string };
export const COLUNAS_OS: ColunaOS[] = [
  { key: "ABERTA", label: "Em aberto", status: ["ABERTA"], cor: "bg-muted-foreground", corTexto: "text-muted-foreground", icon: LockOpen },
  { key: "PLANEJADA", label: "Planejada", status: ["PLANEJADA"], cor: "bg-info", corTexto: "text-info", icon: CalendarCheck },
  { key: "EM_EXECUCAO", label: "Em progresso", status: ["EM_EXECUCAO"], cor: "bg-warning", corTexto: "text-warning", icon: PlayCircle },
  { key: "PAUSADA", label: "Em espera", status: ["PAUSADA", "AGUARDANDO_MATERIAL", "AGUARDANDO_TERCEIRO"], cor: "bg-orange-500", corTexto: "text-orange-600", icon: PauseCircle },
  { key: "ENCERRADA", label: "A validar (PCM)", status: ["ENCERRADA"], cor: "bg-purple-500", corTexto: "text-purple-600", icon: ClipboardCheck },
  { key: "CONCLUIDA", label: "Concluídas · 30 dias", status: ["CONCLUIDA"], cor: "bg-success", corTexto: "text-success", icon: CheckCircle2 },
];
export const colunaDoStatus = (status: string) => COLUNAS_OS.find((c) => c.status.includes(status))?.key ?? null;

// ── Ações (espelho do motor) ───────────────────────────────────────────────
export type AcaoOSTela = "planejar" | "iniciar" | "pausar" | "aguardar_material" | "aguardar_terceiro" | "retomar" | "encerrar" | "concluir" | "devolver" | "reabrir";

const ORIGEM: Record<AcaoOSTela, string[]> = {
  planejar: ["ABERTA", "PLANEJADA", "EM_EXECUCAO", "PAUSADA", "AGUARDANDO_MATERIAL", "AGUARDANDO_TERCEIRO"],
  iniciar: ["ABERTA", "PLANEJADA"],
  pausar: ["EM_EXECUCAO"],
  aguardar_material: ["ABERTA", "PLANEJADA", "EM_EXECUCAO", "PAUSADA", "AGUARDANDO_TERCEIRO"],
  aguardar_terceiro: ["ABERTA", "PLANEJADA", "EM_EXECUCAO", "PAUSADA", "AGUARDANDO_MATERIAL"],
  retomar: ["PAUSADA", "AGUARDANDO_MATERIAL", "AGUARDANDO_TERCEIRO"],
  encerrar: ["EM_EXECUCAO", "PAUSADA", "AGUARDANDO_MATERIAL", "AGUARDANDO_TERCEIRO", "ABERTA", "PLANEJADA"],
  concluir: ["ENCERRADA"],
  devolver: ["ENCERRADA"],
  reabrir: ["CONCLUIDA"],
};
export const DESTINO_ACAO: Record<AcaoOSTela, string> = {
  planejar: "PLANEJADA", iniciar: "EM_EXECUCAO", pausar: "PAUSADA", aguardar_material: "AGUARDANDO_MATERIAL",
  aguardar_terceiro: "AGUARDANDO_TERCEIRO", retomar: "EM_EXECUCAO", encerrar: "ENCERRADA", concluir: "CONCLUIDA",
  devolver: "EM_EXECUCAO", reabrir: "EM_EXECUCAO",
};
export const ACAO_LABEL: Record<AcaoOSTela, string> = {
  planejar: "Planejar", iniciar: "Iniciar", pausar: "Pausar", aguardar_material: "Aguardar material",
  aguardar_terceiro: "Aguardar terceiro", retomar: "Retomar", encerrar: "Encerrar execução", concluir: "Validar e concluir",
  devolver: "Devolver p/ execução", reabrir: "Reabrir",
};
/** Pedem motivo (o motor recusa sem). */
export const ACOES_COM_MOTIVO: AcaoOSTela[] = ["pausar", "aguardar_material", "aguardar_terceiro", "devolver", "reabrir"];
/** Só o PCM (permissão pcm.validacao.editar). */
export const ACOES_PCM_TELA: AcaoOSTela[] = ["planejar", "concluir", "devolver", "reabrir"];

const pode = (acao: AcaoOSTela, status: string) => ORIGEM[acao].includes(status);

/**
 * Ações possíveis ao soltar uma OS (no status `status`) na coluna `coluna`.
 * Lista vazia + `erro` = transição inválida (o cartão não se move).
 * Mais de uma ação (coluna Pausada/Aguardando) = o usuário escolhe no diálogo.
 */
export function acoesParaColuna(status: string, coluna: string): { acoes: AcaoOSTela[]; erro?: string } {
  const candidatas: Record<string, AcaoOSTela[]> = {
    ABERTA: [],
    PLANEJADA: ["planejar"],
    EM_EXECUCAO: ["iniciar", "retomar", "devolver", "reabrir"],
    PAUSADA: ["pausar", "aguardar_material", "aguardar_terceiro"],
    ENCERRADA: ["encerrar"],
    CONCLUIDA: ["concluir"],
  };
  const acoes = (candidatas[coluna] ?? []).filter((a) => pode(a, status));
  if (acoes.length) return { acoes };
  const erro =
    coluna === "ABERTA" ? "Uma OS não volta para Aberta — use Planejada ou Em execução."
    : coluna === "CONCLUIDA" ? "Só OS encerrada (a validar) pode ser concluída."
    : coluna === "PLANEJADA" ? "Só OS aberta pode ser planejada."
    : coluna === "PAUSADA" && status === "ENCERRADA" ? "OS encerrada não pausa — devolva para execução."
    : "Essa mudança de status não é permitida.";
  return { acoes: [], erro };
}

export const PRIORIDADE_BORDA: Record<string, string> = {
  EMERGENCIA: "border-l-danger",
  ALTA: "border-l-orange-500",
  MEDIA: "border-l-info",
  BAIXA: "border-l-border",
};

// ── Régua de status do detalhe (formato CMMS: 4 estados) ───────────────────
/** Os 9 status internos agrupados nos 4 botões da régua. CANCELADA fica fora. */
export type GrupoStatusOS = "aberto" | "espera" | "progresso" | "concluida";
export const GRUPO_DO_STATUS: Record<string, GrupoStatusOS | undefined> = {
  ABERTA: "aberto", PLANEJADA: "aberto",
  PAUSADA: "espera", AGUARDANDO_MATERIAL: "espera", AGUARDANDO_TERCEIRO: "espera",
  EM_EXECUCAO: "progresso",
  ENCERRADA: "concluida", CONCLUIDA: "concluida",
};

/** Cor (fundo) de cada status na barra de linha do tempo. */
export const COR_STATUS_BARRA: Record<string, string> = {
  ABERTA: "bg-muted-foreground/50", PLANEJADA: "bg-info", EM_EXECUCAO: "bg-warning",
  PAUSADA: "bg-orange-400", AGUARDANDO_MATERIAL: "bg-orange-500", AGUARDANDO_TERCEIRO: "bg-orange-600",
  ENCERRADA: "bg-purple-500", CONCLUIDA: "bg-success", CANCELADA: "bg-danger",
};

/** Evento da linha do tempo (ManutOrdemEvento.tipo) → status em que a OS entrou. */
const STATUS_DO_EVENTO: Record<string, string> = {
  PLANEJAR: "PLANEJADA", INICIAR: "EM_EXECUCAO", PAUSAR: "PAUSADA", AGUARDAR_MATERIAL: "AGUARDANDO_MATERIAL",
  AGUARDAR_TERCEIRO: "AGUARDANDO_TERCEIRO", RETOMAR: "EM_EXECUCAO", ENCERRAR: "ENCERRADA", CONCLUIR: "CONCLUIDA",
  DEVOLVER: "EM_EXECUCAO", REABRIR: "EM_EXECUCAO", CANCELAR: "CANCELADA",
};

export type SegmentoStatus = { status: string; inicio: number; fim: number };

/**
 * Quanto tempo a OS passou em cada status, a partir dos eventos. A OS nasce
 * ABERTA (preventiva do plano nasce PLANEJADA); o último trecho vai até agora
 * (ou até o evento de conclusão/cancelamento). OS do histórico sem eventos → [].
 */
export function segmentosStatus(
  eventos: { tipo: string; createdAt: string }[], criadaEm: string, statusAtual: string, nasceuPlanejada: boolean, agora: number,
): SegmentoStatus[] {
  const mudancas = eventos.filter((e) => STATUS_DO_EVENTO[e.tipo]);
  if (!eventos.length) return [];
  const segs: SegmentoStatus[] = [];
  let status = nasceuPlanejada ? "PLANEJADA" : "ABERTA";
  let inicio = new Date(eventos.find((e) => e.tipo === "CRIADA")?.createdAt ?? criadaEm).getTime();
  for (const e of mudancas) {
    const t = new Date(e.createdAt).getTime();
    if (t > inicio) segs.push({ status, inicio, fim: t });
    status = STATUS_DO_EVENTO[e.tipo]; inicio = t;
  }
  const final = ["CONCLUIDA", "CANCELADA"].includes(statusAtual);
  // fechada: o último trecho (concluída/cancelada) vira um marco curto, não cresce com o relógio
  segs.push({ status, inicio, fim: final ? inicio : Math.max(agora, inicio) });
  return segs;
}

/** "3d 4h", "5h 20min", "12 min". */
export function fmtDuracao(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h${min % 60 ? ` ${min % 60}min` : ""}`;
  const d = Math.floor(h / 24);
  return `${d}d${h % 24 ? ` ${h % 24}h` : ""}`;
}

/** Situação do item previsto frente às requisições vinculadas à OS. */
export type SituacaoReserva = "pendente" | "requisitado" | "atendido";
export function situacaoReserva(
  itemId: string | null,
  requisicoes: { tipo: string; status: string; itens: { itemId: string }[] }[],
): SituacaoReserva | null {
  if (!itemId) return null;
  const reqs = requisicoes.filter((r) => r.tipo !== "DEVOLUCAO" && r.status !== "CANCELADA" && r.itens.some((i) => i.itemId === itemId));
  if (reqs.some((r) => r.status === "ATENDIDA")) return "atendido";
  return reqs.length ? "requisitado" : "pendente";
}
