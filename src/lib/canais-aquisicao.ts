// Canais de aquisição de clientes de um concorrente. A localização física conta
// como um canal (LOCALIZACAO); Instagram, site, WhatsApp etc. são outros.
export const CANAIS_AQUISICAO: { value: string; label: string }[] = [
  { value: "LOCALIZACAO", label: "Loja física" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "TELEGRAM", label: "Telegram" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "SITE", label: "Site" },
  { value: "EMAIL", label: "E-mail" },
  { value: "TELEFONE", label: "Telefone" },
  { value: "MARKETPLACE", label: "Marketplace" },
  { value: "INDICACAO", label: "Indicação" },
  { value: "OUTRO", label: "Outro" },
];

// "Loja física" é um canal geolocalizado (endereço + pino no mapa).
export const CANAL_LOCALIZACAO = "LOCALIZACAO";
export const ehCanalLocal = (tipo: string) => tipo === CANAL_LOCALIZACAO;

export const labelCanal = (v: string) => CANAIS_AQUISICAO.find((c) => c.value === v)?.label ?? v;
