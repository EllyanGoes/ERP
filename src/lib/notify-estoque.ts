import { sendTelegramChannel, escMD } from "@/lib/telegram";

interface MovNotifParams {
  tipo: "ENTRADA" | "SAIDA" | "AJUSTE" | "TRANSFERENCIA";
  itemDescricao: string;
  itemCodigo?: string | null;
  quantidade: number;
  saldoDepois: number;
  unidade?: string | null;
  localNome?: string | null;
  documento?: string | null;
  observacoes?: string | null;
  // minimum stock alert
  quantidadeMin?: number | null;
}

export async function notifyMovimentacao(params: MovNotifParams): Promise<void> {
  const {
    tipo, itemDescricao, itemCodigo, quantidade, saldoDepois,
    unidade, localNome, documento, observacoes, quantidadeMin,
  } = params;

  const icon = tipo === "ENTRADA" ? "📦" : tipo === "SAIDA" ? "📤" : tipo === "AJUSTE" ? "🔧" : "🔄";
  const tipoLabel = tipo === "ENTRADA" ? "Entrada" : tipo === "SAIDA" ? "Saída" : tipo === "AJUSTE" ? "Ajuste" : "Transferência";
  const sinal = tipo === "SAIDA" ? "-" : "+";
  const un = unidade ?? "un";
  const qtdFmt = quantidade.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  const saldoFmt = saldoDepois.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });

  const lines: string[] = [
    `${icon} *${escMD(tipoLabel)} de Material*`,
    ``,
    `• *Item:* ${escMD(itemDescricao)}${itemCodigo ? ` \\(${escMD(itemCodigo)}\\)` : ""}`,
    `• *Quantidade:* ${escMD(sinal + qtdFmt)} ${escMD(un)}`,
    `• *Saldo:* ${escMD(saldoFmt)} ${escMD(un)}`,
    ...(localNome ? [`• *Local:* ${escMD(localNome)}`] : []),
    ...(documento ? [`• *Doc:* ${escMD(documento)}`] : []),
    ...(observacoes ? [`• *Obs:* ${escMD(observacoes)}`] : []),
  ];

  // Non-blocking
  sendTelegramChannel("tg_chat_estoque", { text: lines.join("\n") }).catch(() => {});

  // Minimum stock alert
  if (tipo === "SAIDA" && quantidadeMin != null && quantidadeMin > 0 && saldoDepois < quantidadeMin) {
    const alertLines: string[] = [
      `⚠️ *Estoque Abaixo do Mínimo*`,
      ``,
      `• *Item:* ${escMD(itemDescricao)}${itemCodigo ? ` \\(${escMD(itemCodigo)}\\)` : ""}`,
      `• *Saldo atual:* ${escMD(saldoFmt)} ${escMD(un)}`,
      `• *Mínimo:* ${escMD(quantidadeMin.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 }))} ${escMD(un)}`,
      ...(localNome ? [`• *Local:* ${escMD(localNome)}`] : []),
    ];
    sendTelegramChannel("tg_chat_estoque", { text: alertLines.join("\n") }).catch(() => {});
  }
}
