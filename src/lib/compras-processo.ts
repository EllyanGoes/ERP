// ─────────────────────────────────────────────────────────────────────────────
// Processo de compras: SC → CT → PC → DE vistos como UM processo só.
//
// A fase é sempre DERIVADA dos documentos, nunca gravada: o processo anda quando
// o próximo documento nasce ou o atual é concluído. Na rara divisão (uma SC com
// dois pedidos), o processo fica na fase MENOS avançada que ainda tem trabalho.
// ─────────────────────────────────────────────────────────────────────────────

export type EtapaCompra = "solicitacao" | "cotacao" | "pedido" | "entrada";

export const SC_ATIVAS = [
  "RASCUNHO", "AGUARDANDO_APROVACAO", "APROVADA", "EM_COTACAO", "EM_PEDIDO", "PARCIALMENTE_ATENDIDA",
] as const;

type ComStatus = { status: string };

export type DocumentosDoProcesso = {
  sc: ComStatus | null;
  cotacoes: ComStatus[];
  pedidos: (ComStatus & { entrada: ComStatus | null })[];
  entradasAvulsas: ComStatus[];
};

export const cotacaoAberta = (c: ComStatus) => c.status !== "CONCLUIDA";
export const entradaAberta = (e: ComStatus) => e.status !== "CONCLUIDA";
export const pedidoVivo = (p: ComStatus) => p.status !== "CANCELADO";
/** Pedido vivo aguardando o documento de entrada (o DE nasce no recebimento). */
export const pedidoAberto = (p: ComStatus & { entrada: ComStatus | null }) =>
  pedidoVivo(p) && !p.entrada && p.status !== "RECEBIDO";

export function faseDoProcesso(d: DocumentosDoProcesso): { etapa: EtapaCompra; concluido: boolean } {
  const vivos = d.pedidos.filter(pedidoVivo);
  const entradas = [
    ...vivos.flatMap((p) => (p.entrada ? [p.entrada] : [])),
    ...d.entradasAvulsas,
  ];

  if (d.cotacoes.some(cotacaoAberta)) return { etapa: "cotacao", concluido: false };
  if (vivos.some(pedidoAberto)) return { etapa: "pedido", concluido: false };
  if (entradas.some(entradaAberta)) return { etapa: "entrada", concluido: false };

  // Nada aberto adiante: a SC volta a ser o trabalho se sobrou item para comprar
  // (atendida em parte) ou se nenhum pedido vivo chegou a existir.
  const scAtiva = !!d.sc && (SC_ATIVAS as readonly string[]).includes(d.sc.status);
  if (d.sc?.status === "PARCIALMENTE_ATENDIDA" || (scAtiva && vivos.length === 0 && entradas.length === 0)) {
    return { etapa: "solicitacao", concluido: false };
  }

  const etapa: EtapaCompra =
    entradas.length > 0 ? "entrada" : vivos.length > 0 ? "pedido" : d.cotacoes.length > 0 ? "cotacao" : "solicitacao";
  return { etapa, concluido: true };
}

// ── Colunas do quadro: quem deve a próxima ação ───────────────────────────────
export type ColunaCompra = "montagem" | "aprovacao" | "entrega" | "conferencia";

const ORDEM_COLUNAS: ColunaCompra[] = ["montagem", "aprovacao", "entrega", "conferencia"];
const NOME_COLUNA: Record<ColunaCompra, string> = {
  montagem: "Em montagem", aprovacao: "Aguardando aprovação", entrega: "Aguardando entrega", conferencia: "Em conferência",
};

export function colunaDoDocumento(etapa: EtapaCompra, status: string): ColunaCompra {
  if (etapa === "entrada") return "conferencia";
  if (etapa === "solicitacao") return "montagem";
  if (status === "AGUARDANDO_APROVACAO") return "aprovacao";
  if (etapa === "cotacao" || status === "RASCUNHO") return "montagem";
  return "entrega";
}

/** Concluída fica na última coluna, qualquer que seja o último documento. */
export const colunaDoCartao = (etapa: EtapaCompra, status: string, concluido: boolean): ColunaCompra =>
  concluido ? "conferencia" : colunaDoDocumento(etapa, status);

/**
 * Desde quando o documento está na coluna atual. Só a última mudança de COLUNA
 * conta: PENDENTE → EM_ANALISE não zera o tempo de "Em montagem". Logs em ordem
 * cronológica; sem transição registrada, vale a criação do documento.
 */
export function entradaNaColuna(
  etapa: EtapaCompra,
  criadoEm: Date,
  logs: { statusDe: string | null; statusPara: string; criadoEm: Date }[],
): Date {
  if (logs.length === 0) return criadoEm;
  const atual = colunaDoDocumento(etapa, logs[logs.length - 1].statusPara);
  for (let i = logs.length - 1; i >= 0; i--) {
    const { statusDe } = logs[i];
    if (statusDe != null && colunaDoDocumento(etapa, statusDe) !== atual) return logs[i].criadoEm;
  }
  return criadoEm;
}

// ── Arrastar o cartão para a próxima coluna ───────────────────────────────────
// Arrastar nunca cria nem aprova nada: só leva ao lugar da próxima ação.
export type ResultadoArraste = { href: string; aviso?: string; acao?: string } | { erro: string } | null;

export function destinoDoArraste(
  c: { etapa: EtapaCompra; coluna: ColunaCompra; concluido: boolean; status: string; atual: { id: string } },
  para: ColunaCompra,
): ResultadoArraste {
  if (para === c.coluna) return null;
  if (c.concluido) return { erro: "Esta compra já foi concluída." };

  const de = ORDEM_COLUNAS.indexOf(c.coluna);
  const ate = ORDEM_COLUNAS.indexOf(para);
  if (ate < de) return { erro: "O cartão só avança. Para voltar, ajuste ou cancele o documento atual." };
  if (ate > de + 1) return { erro: `Passe antes por ${NOME_COLUNA[ORDEM_COLUNAS[de + 1]]}.` };

  const cotacao = `/suprimentos/cotacoes/${c.atual.id}`;
  const pedido = `/suprimentos/pedidos-compra/${c.atual.id}`;

  if (c.coluna === "montagem") {
    if (c.etapa === "solicitacao") {
      if (c.status !== "APROVADA") return { erro: "Só solicitação aprovada pode gerar cotação." };
      return { href: `/suprimentos/cotacoes/nova?necessidadeId=${c.atual.id}` };
    }
    if (c.etapa === "cotacao") {
      return { href: cotacao, acao: "Abrir cotação", aviso: "Registre as propostas e envie a cotação para aprovação." };
    }
    return { href: pedido, acao: "Abrir pedido", aviso: "Conclua o rascunho do pedido para seguir." };
  }
  if (c.coluna === "aprovacao") {
    return c.etapa === "cotacao"
      ? { href: cotacao, acao: "Abrir cotação", aviso: "O pedido é gerado quando o aprovador aprova a cotação." }
      : { href: pedido, acao: "Abrir pedido", aviso: "O pedido editado precisa ser aprovado novamente." };
  }
  return { href: `/suprimentos/conferencias/novo?pedidoId=${c.atual.id}` };
}

// ── Propostas da Nova compra ──────────────────────────────────────────────────
export type ItemCompra = { itemId: string; quantidade: number };
export type PropostaCompra = {
  fornecedorId: string;
  precos: Record<string, number | null>;
  frete?: number | null;
  vrDesconto?: number | null;
  condicoesPagamento?: string | null;
  prazoEntregaDias?: number | null;
};

/** Aceita "1234.5", "1234,5" e "1.234,50". Vazio ou inválido vira null. */
export function numeroDigitado(texto: string | null | undefined): number | null {
  const limpo = (texto ?? "").trim();
  if (!limpo) return null;
  const n = parseFloat(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo);
  return Number.isFinite(n) ? n : null;
}

/** A cotação guarda uma linha por produto: repetições na SC somam a quantidade. */
export function agruparItens(linhas: ItemCompra[]): ItemCompra[] {
  const mapa = new Map<string, number>();
  for (const l of linhas) mapa.set(l.itemId, (mapa.get(l.itemId) ?? 0) + l.quantidade);
  return Array.from(mapa, ([itemId, quantidade]) => ({ itemId, quantidade }));
}

export const propostaCompleta = (itens: ItemCompra[], p: PropostaCompra) =>
  itens.length > 0 && itens.every((i) => (p.precos[i.itemId] ?? 0) > 0);

export function subtotalDaProposta(itens: ItemCompra[], p: PropostaCompra): number {
  return itens.reduce((soma, i) => soma + (p.precos[i.itemId] ?? 0) * i.quantidade, 0);
}

export function totalDaProposta(itens: ItemCompra[], p: PropostaCompra): number {
  return Math.round((subtotalDaProposta(itens, p) - (p.vrDesconto ?? 0) + (p.frete ?? 0)) * 100) / 100;
}

/** O escolhido pelo comprador, se a proposta dele estiver completa; senão, a de menor total. */
export function vencedorDaCompra(
  itens: ItemCompra[],
  propostas: PropostaCompra[],
  escolhido?: string | null,
): string | null {
  const completas = propostas.filter((p) => propostaCompleta(itens, p));
  if (escolhido && completas.some((p) => p.fornecedorId === escolhido)) return escolhido;
  if (completas.length === 0) return null;
  return completas.reduce((melhor, p) => (totalDaProposta(itens, p) < totalDaProposta(itens, melhor) ? p : melhor)).fornecedorId;
}

/**
 * Mais de um fornecedor não é obrigatório (decisão do dono). Ao enviar para
 * aprovação, porém, nenhuma proposta pode ter preço faltando: o pedido nasce só
 * com os itens que têm preço, e um item sem preço sumiria sem aviso.
 */
export function validarPropostas(itens: ItemCompra[], propostas: PropostaCompra[], enviar: boolean): string | null {
  const ids = propostas.map((p) => p.fornecedorId);
  if (ids.some((id) => !id)) return "Selecione o fornecedor de todas as propostas";
  if (new Set(ids).size !== ids.length) return "O mesmo fornecedor foi informado em mais de uma proposta";
  if (propostas.some((p) => totalDaProposta(itens, p) < 0)) return "O desconto não pode ser maior que o valor da proposta";
  if (!enviar) return null;
  if (propostas.length === 0) return "Informe ao menos um fornecedor com preços para enviar à aprovação";
  if (propostas.some((p) => !propostaCompleta(itens, p))) {
    return "Preencha o preço de todos os itens em cada proposta, ou remova o fornecedor";
  }
  return null;
}
