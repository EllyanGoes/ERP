// Tipos do front do módulo de Projetos (payloads das APIs /api/projetos/*).

export type EtiquetaDTO = { id: string; nome: string; cor: string };

export type MembroDTO = {
  id: string;
  usuarioId: string;
  papel: string;
  favorito: boolean;
  usuario: { id: string; nome: string; email: string };
};

export type ColunaDTO = {
  id: string;
  nome: string;
  ordem: number;
  cor: string | null;
  concluiTarefa: boolean;
};

export type TarefaResumoDTO = {
  id: string;
  projetoId: string;
  colunaId: string;
  titulo: string;
  ordem: number;
  prioridade: "BAIXA" | "MEDIA" | "ALTA" | "URGENTE";
  prazo: string | null;
  dataInicio: string | null;
  concluidaEm: string | null;
  arquivada: boolean;
  temDescricao?: boolean;
  membros: { id: string; nome: string }[];
  etiquetas: EtiquetaDTO[];
  checklistFeitos: number;
  checklistTotal: number;
  _count: { comentarios: number; anexos: number; checklist: number };
};

export type ProjetoBoardDTO = {
  id: string;
  nome: string;
  descricao: string | null;
  empresaId?: string | null;
  situacao?: string;
  cor: string | null;
  icone: string | null;
  visibilidade: "PRIVADO" | "PUBLICO";
  status: "ATIVO" | "ARQUIVADO";
  donoId: string;
  dono: { id: string; nome: string };
  membros: MembroDTO[];
  etiquetas: EtiquetaDTO[];
  colunas: ColunaDTO[];
  tarefas: TarefaResumoDTO[];
  meuNivel: "DONO" | "ADMIN" | "MEMBRO" | "LEITURA";
  meuFavorito: boolean;
};

export type ProjetoHomeDTO = {
  id: string;
  nome: string;
  descricao: string | null;
  cor: string | null;
  icone: string | null;
  visibilidade: "PRIVADO" | "PUBLICO";
  status: "ATIVO" | "ARQUIVADO";
  // Situação de andamento: NAO_INICIADO | EM_ANDAMENTO | PAUSADO | CONCLUIDO.
  situacao?: string;
  donoId: string;
  donoNome: string;
  // Projeto por empresa (null = geral do grupo) — tag e filtro na home.
  empresaId: string | null;
  souMembro: boolean;
  favorito: boolean;
  membros: { id: string; nome: string; papel: string }[];
  tarefasAbertas: number;
  tarefasConcluidas: number;
  tarefasAtrasadas: number;
  atualizadoEm: string;
};

export const PRIORIDADES: Record<string, { label: string; cls: string }> = {
  BAIXA:   { label: "Baixa",   cls: "bg-muted text-muted-foreground" },
  MEDIA:   { label: "Média",   cls: "bg-info/15 text-info" },
  ALTA:    { label: "Alta",    cls: "bg-warning/15 text-warning" },
  URGENTE: { label: "Urgente", cls: "bg-danger/15 text-danger" },
};

export const CORES_PROJETO = [
  "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c",
  "#ca8a04", "#16a34a", "#0d9488", "#0891b2", "#64748b",
];

/**
 * Prazo como meia-noite LOCAL do dia salvo. O prazo é uma data pura gravada
 * como meia-noite UTC — parsear o ISO inteiro desloca 1 dia em fusos
 * negativos (BRT: 17 vira 16). Sempre posicione/agrupe por esta função.
 */
export function diaPrazo(prazo: string): Date {
  return new Date(prazo.slice(0, 10) + "T00:00:00");
}

export function prazoInfo(prazo: string | null, concluida: boolean): { label: string; cls: string } | null {
  if (!prazo) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dia = diaPrazo(prazo);
  const diff = Math.round((dia.getTime() - hoje.getTime()) / 86_400_000);
  const label = dia.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  if (concluida) return { label, cls: "text-muted-foreground" };
  if (diff < 0) return { label, cls: "text-danger font-semibold" };
  if (diff === 0) return { label: "Hoje", cls: "text-warning font-semibold" };
  if (diff === 1) return { label: "Amanhã", cls: "text-warning" };
  return { label, cls: "text-muted-foreground" };
}
