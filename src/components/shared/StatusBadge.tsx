import { cn } from "@/lib/utils";

// Cada status tem o par claro (bg-X-100 text-X-700) + a variante dark (tom mais
// claro do texto sobre fundo translúcido) para legibilidade no tema escuro.
const configs: Record<string, { label: string; className: string }> = {
  // StatusNecessidade
  RASCUNHO: { label: "Rascunho", className: "bg-gray-100 text-gray-600 dark:bg-muted dark:text-muted-foreground" },
  AGUARDANDO_APROVACAO: { label: "Aguard. Aprovação", className: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300" },
  APROVADA: { label: "Aprovada", className: "bg-green-100 text-green-700 dark:bg-green-400/15 dark:text-green-300" },
  REJEITADA: { label: "Rejeitada", className: "bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-300" },
  EM_COTACAO: { label: "Em Cotação", className: "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300" },
  EM_PEDIDO: { label: "Em Pedido", className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300" },
  TOTALMENTE_ATENDIDA: { label: "Totalmente Atendida", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300" },
  PARCIALMENTE_ATENDIDA: { label: "Parcialmente Atendida", className: "bg-orange-100 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300" },
  CANCELADA: { label: "Cancelada", className: "bg-gray-200 text-gray-600 dark:bg-muted dark:text-muted-foreground" },
  // StatusCotacaoCompra (3 estados)
  EM_ANALISE: { label: "Em Análise", className: "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300" },
  // StatusRespostaFornecedor
  AGUARDANDO: { label: "Aguardando", className: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300" },
  RESPONDIDA: { label: "Respondida", className: "bg-green-100 text-green-700 dark:bg-green-400/15 dark:text-green-300" },
  RECUSADA: { label: "Recusada", className: "bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-300" },
  // StatusPedidoCompra
  AGUARDANDO_PAGAMENTO: { label: "Aguard. Pagamento", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-400/15 dark:text-yellow-300" },
  EM_TRANSITO: { label: "Em Trânsito", className: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300" },
  ENVIADO: { label: "Enviado", className: "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300" },
  RECEBIDO: { label: "Recebido", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300" },
  // StatusConferenciaCompra
  PENDENTE: { label: "Pendente", className: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300" },
  EM_CONFERENCIA: { label: "Em Conferência", className: "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300" },
  CONCLUIDA: { label: "Concluída", className: "bg-green-100 text-green-700 dark:bg-green-400/15 dark:text-green-300" },
  DIVERGENCIA: { label: "Divergência", className: "bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-300" },
  // StatusPedidoVenda
  ORCAMENTO: { label: "Orçamento", className: "bg-gray-100 text-gray-700 dark:bg-muted dark:text-muted-foreground" },
  CONFIRMADO: { label: "Confirmado", className: "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300" },
  EM_AGENDAMENTO: { label: "Em Agendamento", className: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300" },
  ENTREGUE:  { label: "Entregue",  className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300" },
  CONCLUIDO: { label: "Concluído", className: "bg-emerald-100 text-emerald-800 font-semibold dark:bg-emerald-400/15 dark:text-emerald-300" },
  CANCELADO: { label: "Cancelado", className: "bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-300" },
  // StatusConta
  ABERTA: { label: "Aberta", className: "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300" },
  PAGA: { label: "Paga", className: "bg-green-100 text-green-700 dark:bg-green-400/15 dark:text-green-300" },
  VENCIDA: { label: "Vencida", className: "bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-300" },
  PARCIAL: { label: "Parcial", className: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300" },
  // StatusCliente
  ATIVO: { label: "Ativo", className: "bg-green-100 text-green-700 dark:bg-green-400/15 dark:text-green-300" },
  INATIVO: { label: "Inativo", className: "bg-gray-100 text-gray-600 dark:bg-muted dark:text-muted-foreground" },
  PROSPECTO: { label: "Prospecto", className: "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300" },
};

export default function StatusBadge({ status, label }: { status: string; label?: string }) {
  const cfg = configs[status] ?? { label: status, className: "bg-gray-100 text-gray-600 dark:bg-muted dark:text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", cfg.className)}>
      {label ?? cfg.label}
    </span>
  );
}
