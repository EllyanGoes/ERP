const num = (d: unknown) => parseFloat(String(d));
const round2 = (n: number) => Math.round(n * 100) / 100;

export type CondicaoParcelas = {
  numeroParcelas?: number | null;
  prazoInicial?: number | null;      // dias até a 1ª parcela
  intervaloParcelas?: number | null; // dias entre parcelas
  diasParcelas?: string | null;      // dias específicos, ex.: "15,30,45" (sobrepõe os acima)
  percentuaisParcelas?: string | null; // % por parcela, ex.: "50,50" (senão divide igual)
  semVencimento?: boolean | null;    // "Faturado / a combinar" → sem vencimento
} | null;

// "15/30/45", "30, 60, 90" → [15,30,45]. Ignora vazios/negativos. (Não ordena —
// a ordem das parcelas segue a digitada, casando com os percentuais.)
function parseNums(s?: string | null): number[] {
  if (!s) return [];
  return s
    .split(/[,;/\s]+/)
    .map((x) => parseFloat(x.trim().replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n >= 0);
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

  const dias = parseNums(condicao?.diasParcelas).map((d) => Math.round(d));
  const pcts = parseNums(condicao?.percentuaisParcelas);

  // Nº de parcelas: percentuais têm prioridade na contagem; senão dias; senão o
  // modo uniforme (numeroParcelas).
  const prazoInicial = Math.max(0, Math.floor(condicao?.prazoInicial ?? 0));
  const intervalo = Math.max(0, Math.floor(condicao?.intervaloParcelas ?? 30));
  const n = pcts.length > 0 ? pcts.length
    : dias.length > 0 ? dias.length
    : Math.max(1, Math.floor(condicao?.numeroParcelas ?? 1));

  // Dia de vencimento de cada parcela: usa os dias informados; o que faltar cai
  // no intervalo fixo (prazoInicial + i·intervalo).
  const offset = (i: number) => (i < dias.length ? dias[i] : prazoInicial + i * intervalo);

  const baseSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(dataBase));
  const emissao = new Date(`${baseSP}T00:00:00.000Z`);
  const grupoId = n > 1 ? crypto.randomUUID() : null;

  // Valor de cada parcela: por percentual (se informado) ou divisão igual. A
  // última absorve o arredondamento para fechar o total.
  const valorParcela = (i: number, acumulado: number): number => {
    if (i === n - 1) return round2(total - acumulado);
    if (pcts.length > 0) return round2((total * pcts[i]) / 100);
    return Math.floor((total / n) * 100) / 100;
  };

  const out: Parcela[] = [];
  let acumulado = 0;
  for (let i = 0; i < n; i++) {
    const valor = valorParcela(i, acumulado);
    acumulado = round2(acumulado + valor);
    out.push({
      valor,
      dataVencimento: semVencimento ? null : new Date(emissao.getTime() + offset(i) * 86400000),
      parcelaNumero: n > 1 ? i + 1 : null,
      parcelaTotal: n > 1 ? n : null,
      grupoParcelamentoId: grupoId,
    });
  }
  return out;
}
