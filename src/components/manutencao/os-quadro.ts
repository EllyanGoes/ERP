// Tipos e regras de tela do quadro de Ordens de Serviço (/pcm/os).
// As transições espelham o motor (src/lib/manutencao/ordem.ts — ORIGEM/DESTINO),
// que não pode ser importado no cliente; a API continua sendo a palavra final.

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
export type ColunaOS = { key: string; label: string; status: string[]; cor: string };
export const COLUNAS_OS: ColunaOS[] = [
  { key: "ABERTA", label: "Aberta", status: ["ABERTA"], cor: "bg-muted-foreground" },
  { key: "PLANEJADA", label: "Planejada", status: ["PLANEJADA"], cor: "bg-info" },
  { key: "EM_EXECUCAO", label: "Em execução", status: ["EM_EXECUCAO"], cor: "bg-warning" },
  { key: "PAUSADA", label: "Pausada / Aguardando", status: ["PAUSADA", "AGUARDANDO_MATERIAL", "AGUARDANDO_TERCEIRO"], cor: "bg-orange-500" },
  { key: "ENCERRADA", label: "Encerrada (a validar)", status: ["ENCERRADA"], cor: "bg-purple-500" },
  { key: "CONCLUIDA", label: "Concluídas · 30 dias", status: ["CONCLUIDA"], cor: "bg-success" },
];
export const colunaDoStatus = (status: string) => COLUNAS_OS.find((c) => c.status.includes(status))?.key ?? null;

// ── Ações (espelho do motor) ───────────────────────────────────────────────
export type AcaoOSTela = "planejar" | "iniciar" | "pausar" | "aguardar_material" | "aguardar_terceiro" | "retomar" | "encerrar" | "concluir" | "devolver" | "reabrir";

const ORIGEM: Record<AcaoOSTela, string[]> = {
  planejar: ["ABERTA", "PLANEJADA"],
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
