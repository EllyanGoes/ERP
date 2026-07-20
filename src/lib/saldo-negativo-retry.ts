// Helper de cliente para o fluxo "permitir venda/saída com estoque negativo,
// avisando o usuário". Mesmo padrão do PCP: envia sem o flag; se a API responder
// 422 com codigo SALDO_NEGATIVO, mostra os itens que ficariam negativos e, se o
// usuário confirmar, reenvia com permitirSaldoNegativo=true.

export type NegativoInfo = {
  itemId: string;
  descricao?: string | null;
  saldoAtual: number;
  saldoDepois: number;
};

const nf = (n: number) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export function mensagemSaldoNegativo(negativos: NegativoInfo[]): string {
  const linhas = negativos
    .map((ng) => `• ${ng.descricao ?? ng.itemId}: ${nf(ng.saldoAtual)} → ${nf(ng.saldoDepois)}`)
    .join("\n");
  return `Esta operação deixa o estoque NEGATIVO:\n\n${linhas}\n\nConfirmar mesmo assim? O saldo fica negativo até uma entrada/ajuste de inventário.`;
}

/**
 * Executa `enviar(false)`. Se a resposta for 422 com codigo SALDO_NEGATIVO,
 * confirma com o usuário e, aceitando, executa `enviar(true)`. Retorna a
 * resposta final, ou `null` se o usuário recusou o aviso (operação abortada —
 * o caller deve simplesmente parar, sem tratar como erro).
 */
export async function enviarPermitindoSaldoNegativo(
  enviar: (permitirSaldoNegativo: boolean) => Promise<Response>,
): Promise<Response | null> {
  const r = await enviar(false);
  if (r.status !== 422) return r;
  const j = await r.clone().json().catch(() => null as unknown as { codigo?: string; negativos?: NegativoInfo[] } | null);
  if (!j || j.codigo !== "SALDO_NEGATIVO") return r;
  if (!confirm(mensagemSaldoNegativo(j.negativos ?? []))) return null;
  return enviar(true);
}
