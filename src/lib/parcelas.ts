const num = (d: unknown) => parseFloat(String(d));
const round2 = (n: number) => Math.round(n * 100) / 100;

export type CondicaoParcelas = {
  numeroParcelas?: number | null;
  prazoInicial?: number | null;      // dias até a 1ª parcela
  intervaloParcelas?: number | null; // dias entre parcelas
  diasParcelas?: string | null;      // dias específicos, ex.: "15,30,45" (sobrepõe os acima)
  semVencimento?: boolean | null;    // "Faturado / a combinar" → sem vencimento
} | null;

// "15/30/45", "30, 60, 90" → [15,30,45] / [30,60,90]. Ignora vazios/negativos.
function parseDias(s?: string | null): number[] {
  if (!s) return [];
  return s
    .split(/[,;/\s]+/)
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);
}

export type Parcela = {
  valor: number;
  dataVencimento: Date | null;
  parcelaNumero: number | null;
  parcelaTotal: number | null;
  grupoParcelamentoId: string | null;
};

/**
 * Quebra um total em parcelas conforme a condição de pagamento. Usado tanto
 * para contas a receber (vendas) quanto a pagar (compras). Vencimentos como
 * meia-noite UTC (datas puras do projeto). `semVencimento` → todas sem data.
 * Retorna [] se o total ≤ 0.
 */
export function calcularParcelas(
  condicao: CondicaoParcelas,
  totalBruto: unknown,
  dataBase: Date | string,
): Parcela[] {
  const total = round2(num(totalBruto));
  if (total <= 0) return [];

  const semVencimento = condicao?.semVencimento === true;

  // Dias de vencimento por parcela: "diasParcelas" (explícito) tem prioridade;
  // senão, intervalo fixo (prazoInicial + i·intervalo).
  const dias = parseDias(condicao?.diasParcelas);
  const offsets = dias.length > 0
    ? dias
    : (() => {
        const n = Math.max(1, Math.floor(condicao?.numeroParcelas ?? 1));
        const prazoInicial = Math.max(0, Math.floor(condicao?.prazoInicial ?? 0));
        const intervalo = Math.max(0, Math.floor(condicao?.intervaloParcelas ?? 30));
        return Array.from({ length: n }, (_, i) => prazoInicial + i * intervalo);
      })();
  const n = offsets.length;

  const baseSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(dataBase));
  const emissao = new Date(`${baseSP}T00:00:00.000Z`);

  const base = Math.floor((total / n) * 100) / 100;
  const grupoId = n > 1 ? crypto.randomUUID() : null;

  const out: Parcela[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      valor: i === n - 1 ? round2(total - base * (n - 1)) : base,
      dataVencimento: semVencimento ? null : new Date(emissao.getTime() + offsets[i] * 86400000),
      parcelaNumero: n > 1 ? i + 1 : null,
      parcelaTotal: n > 1 ? n : null,
      grupoParcelamentoId: grupoId,
    });
  }
  return out;
}
