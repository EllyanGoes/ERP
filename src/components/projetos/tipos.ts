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
  // INICIO | ANDAMENTO | FIM (FIM = coluna de conclusão)
  categoria: "INICIO" | "ANDAMENTO" | "FIM";
  concluiTarefa: boolean;
};

// Cores de status (colunas), paleta estilo Notion. A cor da coluna aparece no
// cabeçalho do kanban, no filtro de status e nas barras do cronograma.
export const CORES_STATUS: { cor: string; label: string }[] = [
  { cor: "#9ca3af", label: "Cinza" },
  { cor: "#a16207", label: "Marrom" },
  { cor: "#f97316", label: "Laranja" },
  { cor: "#eab308", label: "Amarelo" },
  { cor: "#22c55e", label: "Verde" },
  { cor: "#3b82f6", label: "Azul" },
  { cor: "#8b5cf6", label: "Roxo" },
  { cor: "#ec4899", label: "Rosa" },
  { cor: "#ef4444", label: "Vermelho" },
];
/** Tons derivados de uma cor (#rrggbb): fundo suave, borda e texto. */
export function tonsCor(cor: string | null | undefined): { bg: string; border: string; text: string } | null {
  if (!cor || !/^#[0-9a-fA-F]{6}$/.test(cor)) return null;
  return { bg: `${cor}1f`, border: `${cor}66`, text: cor };
}

export const CATEGORIAS_COLUNA: { key: "INICIO" | "ANDAMENTO" | "FIM"; label: string }[] = [
  { key: "INICIO", label: "Início" },
  { key: "ANDAMENTO", label: "Andamento" },
  { key: "FIM", label: "Fim" },
];

export type TarefaResumoDTO = {
  id: string;
  projetoId: string;
  colunaId: string;
  titulo: string;
  ordem: number;
  prioridade: "BAIXA" | "MEDIA" | "ALTA" | "URGENTE";
  prazo: string | null;
  // "HH:MM" local; null = dia inteiro.
  prazoHora?: string | null;
  dataInicio: string | null;
  concluidaEm: string | null;
  // Ordem manual no cronograma (null = por data).
  ordemCronograma?: number | null;
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
  // Cronograma: dependências entre tarefas e configuração (null = padrão).
  dependencias: { tarefaId: string; dependeDeId: string }[];
  cronograma: { dependencias: boolean; modoDatas: "MARGEM" | "MANTER" | "NAO"; evitarFds: boolean } | null;
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

/** Data+hora do prazo como Date local (hora "HH:MM"; sem hora = meia-noite). */
export function instantePrazo(prazo: string, hora?: string | null): Date {
  const d = diaPrazo(prazo);
  if (hora) {
    const [h, m] = hora.split(":").map(Number);
    d.setHours(h, m, 0, 0);
  }
  return d;
}

export function prazoInfo(prazo: string | null, concluida: boolean, hora?: string | null): { label: string; cls: string } | null {
  if (!prazo) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dia = diaPrazo(prazo);
  const diff = Math.round((dia.getTime() - hoje.getTime()) / 86_400_000);
  const sufixo = hora ? ` ${hora}` : "";
  const label = dia.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) + sufixo;
  if (concluida) return { label, cls: "text-muted-foreground" };
  if (diff < 0) return { label, cls: "text-danger font-semibold" };
  // Com hora no dia de hoje, já passou → atrasada.
  if (diff === 0 && hora && instantePrazo(prazo, hora) < new Date()) return { label: `Hoje${sufixo}`, cls: "text-danger font-semibold" };
  if (diff === 0) return { label: `Hoje${sufixo}`, cls: "text-warning font-semibold" };
  if (diff === 1) return { label: `Amanhã${sufixo}`, cls: "text-warning" };
  return { label, cls: "text-muted-foreground" };
}
