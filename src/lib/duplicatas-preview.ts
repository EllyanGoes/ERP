import { calcularParcelas, type CondicaoParcelas, type Parcela } from "@/lib/parcelas";

// Prévia, no cliente, das duplicatas (parcelas do contas a pagar) que um
// Documento de Entrada vai gerar ao ser concluído. Replica EXATAMENTE a
// precedência do servidor (conferencias/[id]/concluir/route.ts + encargosConferencia
// em lib/pedido-compra-de.ts). NÃO cria nada — só projeta o que a conclusão faria.

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (d: unknown) => (d == null ? 0 : parseFloat(String(d)) || 0);

export type CondicaoFull = NonNullable<CondicaoParcelas> & {
  id: string;
  nome: string;
  pagamentoAntecipado?: boolean | null;
};

export type PreviewItem = {
  vlrTotal: number | null;
  quantidadeRecebida: number;
  vlrUnitario: number;
  desconto: number; // % de desconto da linha
  // Linha COMPONENTE (filho de outra linha): decompõe o preço do pai — fora do
  // líquido e das duplicatas.
  filho?: boolean;
};

// Linha da grade de duplicatas EDITADA manualmente (parcelasCustom do DE).
export type ParcelaCustomRow = { valor: number; dataVencimento: string | null };

export type PreviewPedido = {
  frete: number;
  seguro: number;
  despesas: number;
  vrDesconto: number;
  subtotalItens: number; // Σ valorTotal dos itens do pedido
  valorTotal: number;
  intragrupo: boolean;
  condicaoPagamentoId: string | null;
  condicoesPagamento: string | null; // nome da condição (fallback por nome)
};

export type PreviewDuplicatasInput = {
  itens: PreviewItem[];
  vrTotalNF: number; // vrTotal digitado (0 se vazio)
  freteDE: number;
  descontoDE: number;
  pedido: PreviewPedido | null;
  temFornecedor: boolean;
  condicaoIdDE: string | null;
  condicoes: CondicaoFull[];
  dtEmissao: string | null; // "YYYY-MM-DD"
  // Entrada/sinal JÁ PAGO da fatura: vira título quitado na conclusão e abate
  // do valor a parcelar.
  valorPagoAntecipado?: number;
  dataPagoAntecipado?: string | null; // "YYYY-MM-DD"
  // Grade editada manualmente — substitui calcularParcelas sobre o restante.
  parcelasCustom?: ParcelaCustomRow[] | null;
};

export type BloqueioDuplicatas = "INTRAGRUPO" | "PA" | "SEM_FORNECEDOR" | null;

export type PreviewDuplicatas = {
  valor: number;
  liquido: number;
  condicao: CondicaoFull | null;
  parcelas: Parcela[];
  bloqueio: BloqueioDuplicatas;
  // Entrada já paga (projeção do título quitado) e o restante parcelado.
  entradaPaga: { valor: number; data: string | null } | null;
  restante: number;
  // true = parcelas vêm da grade manual (parcelasCustom), não da condição.
  custom: boolean;
};

// Réplica de encargosConferencia (lib/pedido-compra-de.ts): base = Σ vlrTotal
// da linha (fallback qtd×unit×(1−desc%)); encargos próprios = SÓ frete; quando
// frete e desconto próprios são zero e há pedido, rateia os encargos do pedido
// pela fração recebida em valor.
function calcularLiquido(inp: PreviewDuplicatasInput): number {
  const base = r2(
    inp.itens.reduce((s, it) => {
      if (it.filho) return s; // componente: preço embutido no pai
      if (it.vlrTotal != null) return s + num(it.vlrTotal);
      const pct = num(it.desconto);
      return s + num(it.quantidadeRecebida) * num(it.vlrUnitario) * (1 - (pct > 0 ? pct / 100 : 0));
    }, 0),
  );
  let encargos = r2(num(inp.freteDE));
  let desconto = r2(num(inp.descontoDE));
  if (encargos <= 0 && desconto <= 0 && inp.pedido) {
    const subtotalPedido = num(inp.pedido.subtotalItens);
    const frac = subtotalPedido > 0 ? Math.min(base / subtotalPedido, 1) : 0;
    encargos = r2((num(inp.pedido.frete) + num(inp.pedido.seguro) + num(inp.pedido.despesas)) * frac);
    desconto = r2(num(inp.pedido.vrDesconto) * frac);
  }
  return r2(base - desconto + encargos);
}

// Condição efetiva, na mesma ordem do servidor.
function resolverCondicao(inp: PreviewDuplicatasInput): CondicaoFull | null {
  const byId = (id: string | null | undefined) =>
    id ? inp.condicoes.find((c) => c.id === id) ?? null : null;
  return (
    byId(inp.condicaoIdDE) ??
    (inp.pedido ? byId(inp.pedido.condicaoPagamentoId) : null) ??
    (inp.pedido?.condicoesPagamento
      ? inp.condicoes.find((c) => c.nome === inp.pedido!.condicoesPagamento) ?? null
      : null) ??
    null
  );
}

// Data-base dos vencimentos: dtEmissao como meia-noite UTC; senão hoje em SP,
// também ancorado em meia-noite UTC (idêntico ao servidor).
function resolverDataBase(dtEmissao: string | null): Date {
  if (dtEmissao) return new Date(`${dtEmissao.slice(0, 10)}T00:00:00.000Z`);
  const hojeSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return new Date(`${hojeSP}T00:00:00.000Z`);
}

export function previewDuplicatasDE(inp: PreviewDuplicatasInput): PreviewDuplicatas {
  const liquido = calcularLiquido(inp);
  const condicao = resolverCondicao(inp);
  const vazio = { entradaPaga: null, restante: 0, custom: false };

  // Bloqueios (mesma ordem de decisão do servidor).
  if (inp.pedido?.intragrupo) {
    return { valor: 0, liquido, condicao, parcelas: [], bloqueio: "INTRAGRUPO", ...vazio };
  }
  if (condicao?.pagamentoAntecipado) {
    return { valor: 0, liquido, condicao, parcelas: [], bloqueio: "PA", ...vazio };
  }
  if (!inp.pedido && !inp.temFornecedor) {
    return { valor: 0, liquido, condicao, parcelas: [], bloqueio: "SEM_FORNECEDOR", ...vazio };
  }

  // Valor a pagar: com pedido usa o vrTotal digitado; avulsa usa sempre o líquido.
  const valor = inp.pedido
    ? inp.vrTotalNF > 0
      ? inp.vrTotalNF
      : liquido > 0
        ? liquido
        : num(inp.pedido.valorTotal)
    : liquido;

  // Entrada já paga abate do que vai para as parcelas (mesma conta do servidor).
  const pago = r2(Math.min(num(inp.valorPagoAntecipado), valor));
  const restante = r2(valor - (pago > 0 ? pago : 0));
  const entradaPaga = pago > 0 ? { valor: pago, data: inp.dataPagoAntecipado ?? null } : null;

  // Grade manual substitui a condição sobre o RESTANTE.
  const custom = Array.isArray(inp.parcelasCustom) && inp.parcelasCustom.length > 0;
  const parcelas: Parcela[] = custom
    ? inp.parcelasCustom!.map((p, i, arr) => ({
        valor: r2(num(p.valor)),
        dataVencimento: p.dataVencimento ? new Date(`${p.dataVencimento.slice(0, 10)}T00:00:00.000Z`) : null,
        parcelaNumero: arr.length > 1 ? i + 1 : null,
        parcelaTotal: arr.length > 1 ? arr.length : null,
        grupoParcelamentoId: null,
      }))
    : calcularParcelas(condicao, restante, resolverDataBase(inp.dtEmissao));
  return { valor, liquido, condicao, parcelas, bloqueio: null, entradaPaga, restante, custom };
}
