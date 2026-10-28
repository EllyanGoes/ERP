// Constantes do módulo de Processos (sem dependência de servidor — usadas também nas telas).
export const TIPOS_PROCESSO: Record<string, string> = {
  FUNDIARIO: "Fundiário / imobiliário", AMBIENTAL: "Ambiental / licenciamento", ADMINISTRATIVO: "Administrativo",
  FISCAL: "Fiscal / tributário", JUDICIAL: "Judicial", TRABALHISTA: "Trabalhista", OUTRO: "Outro",
};
export const SITUACOES: Record<string, { label: string; aberto: boolean }> = {
  EM_ANDAMENTO: { label: "Em andamento", aberto: true },
  AGUARDANDO_ORGAO: { label: "Aguardando o órgão", aberto: true },
  AGUARDANDO_EMPRESA: { label: "Aguardando a empresa", aberto: true },
  SUSPENSO: { label: "Suspenso", aberto: true },
  ENCERRADO_FAVORAVEL: { label: "Encerrado — favorável", aberto: false },
  ENCERRADO_DESFAVORAVEL: { label: "Encerrado — desfavorável", aberto: false },
  ARQUIVADO: { label: "Arquivado", aberto: false },
};
export const SITUACOES_ABERTAS = Object.entries(SITUACOES).filter(([, v]) => v.aberto).map(([k]) => k);
export const TIPOS_ANDAMENTO: Record<string, string> = {
  PROTOCOLO: "Protocolo / envio", MOVIMENTACAO: "Movimentação", EXIGENCIA: "Exigência / pendência do órgão",
  MANIFESTACAO: "Manifestação / resposta", DECISAO: "Decisão / parecer", AUDIENCIA: "Audiência",
  VISTORIA: "Vistoria", PAGAMENTO: "Pagamento (taxa/custas)", OUTRO: "Outro",
};
export const PAPEIS_PARTE: Record<string, string> = {
  ORGAO: "Órgão", AUTOR: "Autor", REU: "Réu", ADVOGADO: "Advogado", PERITO: "Perito",
  DESPACHANTE: "Despachante", TECNICO: "Técnico / RT", OUTRO: "Outro",
};
export const ESFERAS: Record<string, string> = { MUNICIPAL: "Municipal", ESTADUAL: "Estadual", FEDERAL: "Federal", JUDICIAL: "Judicial" };
export const RISCOS: Record<string, string> = { PROVAVEL: "Provável", POSSIVEL: "Possível", REMOTA: "Remota" };

/** Situação que o andamento sugere (a tela permite mudar). */
export function situacaoPorAndamento(tipo: string): string | null {
  if (tipo === "EXIGENCIA") return "AGUARDANDO_EMPRESA";
  if (tipo === "PROTOCOLO" || tipo === "MANIFESTACAO") return "AGUARDANDO_ORGAO";
  return null;
}

