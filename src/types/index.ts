export type {
  Cliente,
  Fornecedor,
  Item,
  EstoqueItem,
  MovimentacaoEstoque,
  PedidoVenda,
  PedidoVendaItem,
  ContaReceber,
  ContaPagar,
  LancamentoCaixa,
  Sequencia,
} from "@prisma/client"

export type {
  TipoPessoa,
  StatusCliente,
  TipoItem,
  UnidadeMedida,
  StatusPedidoVenda,
  TipoMovimentacaoEstoque,
  StatusConta,
  TipoLancamentoCaixa,
} from "@prisma/client"

export interface ApiResponse<T> {
  data: T
}

export interface ApiListResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export interface ApiError {
  error: string
  details?: unknown
}
