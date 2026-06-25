// Rastreabilidade dos lançamentos contábeis: mapeia a origem (origemTipo +
// origemId) para a rota do processo que gerou o lançamento. Retorna null quando
// não há destino navegável. Client-safe (sem imports de servidor).

export function linkOrigemLancamento(origemTipo: string, origemId: string | null): string | null {
  if (!origemId) {
    // Títulos/encerramento podem não ter id navegável direto.
    if (origemTipo === "ENCERRAMENTO") return "/contabilidade/fechamento";
    return null;
  }
  switch (origemTipo) {
    case "VENDA":
      // Venda passou a ser dirigida pelo PEDIDO (origemId = pedidoVendaId).
      return `/pedidos-venda/${origemId}`;
    case "RECEBIMENTO":
      return `/contas-receber?focus=${origemId}`;
    case "COMPRA":
    case "PAGAMENTO":
      return `/contas-pagar?focus=${origemId}`;
    case "ESTOQUE_ENTRADA":
      return `/suprimentos/conferencias/${origemId}`;
    case "ESTOQUE_SAIDA":
      return `/comercial/minutas/${origemId}`;
    case "RECEITA_ENTREGA":
      // Receita reconhecida na entrega da minuta (origemId = minutaId).
      return `/comercial/minutas/${origemId}`;
    case "ESTOQUE_PRODUCAO":
      return `/pcp/ordens/${origemId}`;
    case "ESTOQUE_CONSUMO":
      return `/suprimentos/requisicoes-materiais/${origemId}`;
    case "ESTOQUE_AJUSTE":
    case "ESTOQUE_TRANSFERENCIA":
      // origemId = loteId da movimentação manual → foca/destaca o lote na lista.
      return `/suprimentos/movimentacoes?focus=${origemId}`;
    case "DEPRECIACAO":
      return "/contabilidade/imobilizado";
    case "ENCERRAMENTO":
      return "/contabilidade/fechamento";
    default:
      return null;
  }
}
