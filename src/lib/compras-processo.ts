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

// ── Arrastar o cartão para a próxima coluna ───────────────────────────────────
// Arrastar nunca cria nem aprova nada: só leva ao formulário do próximo documento.
const ORDEM: EtapaCompra[] = ["solicitacao", "cotacao", "pedido", "entrada"];
const NOME: Record<EtapaCompra, string> = {
  solicitacao: "Solicitação", cotacao: "Cotação", pedido: "Pedido de Compras", entrada: "Documento de Entrada",
};

export type ResultadoArraste = { href: string; aviso?: string; acao?: string } | { erro: string } | null;

export function destinoDoArraste(
  c: { etapa: EtapaCompra; concluido: boolean; status: string; atual: { id: string } },
  para: EtapaCompra,
): ResultadoArraste {
  if (para === c.etapa) return null;
  if (c.concluido) return { erro: "Esta compra já foi concluída." };

  const de = ORDEM.indexOf(c.etapa);
  const ate = ORDEM.indexOf(para);
  if (ate < de) return { erro: "O cartão só avança. Para voltar, ajuste ou cancele o documento atual." };
  if (ate > de + 1) return { erro: `Passe antes pela etapa ${NOME[ORDEM[de + 1]]}.` };

  if (c.etapa === "solicitacao") {
    if (c.status !== "APROVADA") return { erro: "Só solicitação aprovada pode gerar cotação." };
    return { href: `/suprimentos/cotacoes/nova?necessidadeId=${c.atual.id}` };
  }
  if (c.etapa === "cotacao") {
    // O pedido nasce da aprovação da cotação: não existe formulário para preencher.
    return {
      href: `/suprimentos/cotacoes/${c.atual.id}`,
      acao: "Abrir cotação",
      aviso: c.status === "AGUARDANDO_APROVACAO"
        ? "O pedido é gerado ao aprovar a cotação. Abra a cotação para aprovar."
        : "O pedido é gerado ao aprovar a cotação, que ainda precisa ser analisada e submetida à aprovação.",
    };
  }
  return { href: `/suprimentos/conferencias/novo?pedidoId=${c.atual.id}` };
}
