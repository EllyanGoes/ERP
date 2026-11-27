// Tipos de ativo da Manutenção — módulo sem dependências de servidor (usado
// tanto pelas rotas quanto pelas telas).
//
// LOCAL (área) e LINHA (linha de produção) são AGRUPADORES: organizam a árvore,
// não quebram nem entram em MTBF/MTTR, contagem de equipamentos do mapa etc.

export const TIPOS_ATIVO = ["LOCAL", "LINHA", "EQUIPAMENTO", "COMPONENTE", "VEICULO"] as const;
export type TipoAtivo = (typeof TIPOS_ATIVO)[number];

export const TIPO_ATIVO_LABEL: Record<string, string> = {
  LOCAL: "Área / local",
  LINHA: "Linha de produção",
  EQUIPAMENTO: "Equipamento",
  COMPONENTE: "Componente",
  VEICULO: "Veículo",
};

/** Área ou linha: nó de organização da árvore (não é equipamento). */
export const ehAgrupador = (tipo: string) => tipo === "LOCAL" || tipo === "LINHA";
