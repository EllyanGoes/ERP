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
};

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
};

export type BloqueioDuplicatas = "INTRAGRUPO" | "PA" | "SEM_FORNECEDOR" | null;

export type PreviewDuplicatas = {
  valor: number;
  liquido: number;
  condicao: CondicaoFull | null;
  parcelas: Parcela[];
  bloqueio: BloqueioDuplicatas;
};

// Réplica de encargosConferencia (lib/pedido-compra-de.ts): base = Σ vlrTotal
// da linha (fallback qtd×unit×(1−desc%)); encargos próprios = SÓ frete; quando
// frete e desconto próprios são zero e há pedido, rateia os encargos do pedido
// pela fração recebida em valor.
function calcularLiquido(inp: PreviewDuplicatasInput): number {
  const base = r2(
    inp.itens.reduce((s, it) => {
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

  // Bloqueios (mesma ordem de decisão do servidor).
  if (inp.pedido?.intragrupo) {
    return { valor: 0, liquido, condicao, parcelas: [], bloqueio: "INTRAGRUPO" };
  }
  if (condicao?.pagamentoAntecipado) {
    return { valor: 0, liquido, condicao, parcelas: [], bloqueio: "PA" };
  }
  if (!inp.pedido && !inp.temFornecedor) {
    return { valor: 0, liquido, condicao, parcelas: [], bloqueio: "SEM_FORNECEDOR" };
  }

  // Valor a pagar: com pedido usa o vrTotal digitado; avulsa usa sempre o líquido.
  const valor = inp.pedido
    ? inp.vrTotalNF > 0
      ? inp.vrTotalNF
      : liquido > 0
        ? liquido
        : num(inp.pedido.valorTotal)
    : liquido;

  const parcelas = calcularParcelas(condicao, valor, resolverDataBase(inp.dtEmissao));
  return { valor, liquido, condicao, parcelas, bloqueio: null };
}
