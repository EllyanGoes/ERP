// Rótulos das minutas, sensíveis ao tipo (Entrega vs Retirada).
// A máquina de estados (StatusMinuta) é a mesma para os dois tipos;
// só o texto exibido muda.

export type TipoMinuta = "ENTREGA" | "RETIRADA";
export type StatusMinuta = "PENDENTE" | "SAIU_PARA_ENTREGA" | "ENTREGUE" | "CANCELADA";

export const TIPO_MINUTA_LABEL: Record<TipoMinuta, string> = {
  ENTREGA: "CIF - Entrega",
  RETIRADA: "FOB - Retirada",
};

const STATUS_LABEL_ENTREGA: Record<StatusMinuta, string> = {
  PENDENTE: "Pendente",
  SAIU_PARA_ENTREGA: "Saiu p/ Entrega",
  ENTREGUE: "Entregue",
  CANCELADA: "Cancelada",
};

const STATUS_LABEL_RETIRADA: Record<StatusMinuta, string> = {
  PENDENTE: "Pendente",
  SAIU_PARA_ENTREGA: "Aguardando retirada",
  ENTREGUE: "Retirado",
  CANCELADA: "Cancelada",
};

/** Rótulo do status conforme o tipo da minuta. */
export function statusMinutaLabel(status: StatusMinuta, tipo: TipoMinuta = "ENTREGA"): string {
  const map = tipo === "RETIRADA" ? STATUS_LABEL_RETIRADA : STATUS_LABEL_ENTREGA;
  return map[status] ?? status;
}

/** Rótulo do botão que confirma a conclusão (Entregue/Retirado). */
export function confirmacaoMinutaLabel(tipo: TipoMinuta = "ENTREGA"): string {
  return tipo === "RETIRADA" ? "Confirmar Retirada" : "Confirmar Entrega";
}
