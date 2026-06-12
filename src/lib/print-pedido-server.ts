// Montagem (server-side) dos dados de impressão do pedido de venda a partir
// de um PedidoVenda carregado com cliente, empresa e itens (item + unidade).
// Usado pela página de detalhe e pela rota da venda balcão (PDV imprime
// direto da resposta).
import { decimalToNumber } from "@/lib/utils";
import type { PedidoPrintData } from "@/lib/print-pedido";

type Endereco = {
  logradouro: string | null; numero: string | null; bairro: string | null;
  cidade: string | null; estado: string | null; telefone: string | null;
};

type PedidoParaPrint = {
  numero: string;
  status: string;
  dataEmissao: Date | null;
  condicaoPagamento: string | null;
  formaPagamento: string | null;
  observacoes: string | null;
  valorProdutos: unknown;
  valorDesconto: unknown;
  valorFrete: unknown;
  valorTotal: unknown;
  cliente: { razaoSocial: string; nomeFantasia: string | null; cpfCnpj: string | null } & Endereco;
  empresa: ({ razaoSocial: string; nomeFantasia: string | null; cnpj: string | null } & Endereco) | null;
  itens: Array<{
    quantidade: unknown; precoUnitario: unknown; valorDesconto: unknown; valorTotal: unknown;
    item: { codigo: string; descricao: string; unidadeMedida: string | null; unidade: { sigla: string } | null };
  }>;
};

export function pedidoPrintData(pedido: PedidoParaPrint): PedidoPrintData {
  return {
    numero: pedido.numero,
    status: pedido.status,
    dataEmissao: pedido.dataEmissao?.toISOString() ?? null,
    condicaoPagamento: pedido.condicaoPagamento,
    formaPagamento: pedido.formaPagamento,
    observacoes: pedido.observacoes,
    valorProdutos: decimalToNumber(pedido.valorProdutos),
    valorDesconto: decimalToNumber(pedido.valorDesconto),
    valorFrete: decimalToNumber(pedido.valorFrete),
    valorTotal: decimalToNumber(pedido.valorTotal),
    cliente: {
      razaoSocial: pedido.cliente.razaoSocial,
      nomeFantasia: pedido.cliente.nomeFantasia,
      cpfCnpj: pedido.cliente.cpfCnpj,
      logradouro: pedido.cliente.logradouro,
      numero: pedido.cliente.numero,
      bairro: pedido.cliente.bairro,
      cidade: pedido.cliente.cidade,
      estado: pedido.cliente.estado,
      telefone: pedido.cliente.telefone,
    },
    empresa: pedido.empresa
      ? {
          razaoSocial: pedido.empresa.razaoSocial,
          nomeFantasia: pedido.empresa.nomeFantasia,
          cnpj: pedido.empresa.cnpj,
          logradouro: pedido.empresa.logradouro,
          numero: pedido.empresa.numero,
          bairro: pedido.empresa.bairro,
          cidade: pedido.empresa.cidade,
          estado: pedido.empresa.estado,
          telefone: pedido.empresa.telefone,
        }
      : null,
    itens: pedido.itens.map((i) => ({
      codigo: i.item.codigo,
      descricao: i.item.descricao,
      un: i.item.unidade?.sigla ?? i.item.unidadeMedida ?? "UN",
      quantidade: decimalToNumber(i.quantidade),
      precoUnitario: decimalToNumber(i.precoUnitario),
      valorDesconto: decimalToNumber(i.valorDesconto),
      valorTotal: decimalToNumber(i.valorTotal),
    })),
  };
}
