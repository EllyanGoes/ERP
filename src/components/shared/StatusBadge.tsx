import { cn } from "@/lib/utils";

const configs: Record<string, { label: string; className: string }> = {
  // StatusNecessidade
  RASCUNHO: { label: "Rascunho", className: "bg-gray-100 text-gray-600" },
  AGUARDANDO_APROVACAO: { label: "Aguard. Aprovação", className: "bg-amber-100 text-amber-700" },
  APROVADA: { label: "Aprovada", className: "bg-green-100 text-green-700" },
  REJEITADA: { label: "Rejeitada", className: "bg-red-100 text-red-700" },
  EM_COTACAO: { label: "Em Cotação", className: "bg-blue-100 text-blue-700" },
  TOTALMENTE_ATENDIDA: { label: "Totalmente Atendida", className: "bg-emerald-100 text-emerald-700" },
  PARCIALMENTE_ATENDIDA: { label: "Parcialmente Atendida", className: "bg-orange-100 text-orange-700" },
  // StatusCotacaoCompra (3 estados)
  EM_ANALISE: { label: "Em Análise", className: "bg-blue-100 text-blue-700" },
  // StatusRespostaFornecedor
  AGUARDANDO: { label: "Aguardando", className: "bg-amber-100 text-amber-700" },
  RESPONDIDA: { label: "Respondida", className: "bg-green-100 text-green-700" },
  RECUSADA: { label: "Recusada", className: "bg-red-100 text-red-700" },
  // StatusPedidoCompra
  AGUARDANDO_PAGAMENTO: { label: "Aguard. Pagamento", className: "bg-yellow-100 text-yellow-700" },
  EM_TRANSITO: { label: "Em Trânsito", className: "bg-amber-100 text-amber-700" },
  ENVIADO: { label: "Enviado", className: "bg-blue-100 text-blue-700" },
  RECEBIDO: { label: "Recebido", className: "bg-emerald-100 text-emerald-700" },
  // StatusConferenciaCompra
  PENDENTE: { label: "Pendente", className: "bg-amber-100 text-amber-700" },
  EM_CONFERENCIA: { label: "Em Conferência", className: "bg-blue-100 text-blue-700" },
  CONCLUIDA: { label: "Concluída", className: "bg-green-100 text-green-700" },
  DIVERGENCIA: { label: "Divergência", className: "bg-red-100 text-red-700" },
  // StatusPedidoVenda
  ORCAMENTO: { label: "Orçamento", className: "bg-gray-100 text-gray-700" },
  CONFIRMADO: { label: "Confirmado", className: "bg-blue-100 text-blue-700" },
  EM_AGENDAMENTO: { label: "Em Agendamento", className: "bg-violet-100 text-violet-700" },
  ENTREGUE: { label: "Entregue", className: "bg-green-100 text-green-700" },
  CANCELADO: { label: "Cancelado", className: "bg-red-100 text-red-700" },
  // StatusConta
  ABERTA: { label: "Aberta", className: "bg-blue-100 text-blue-700" },
  PAGA: { label: "Paga", className: "bg-green-100 text-green-700" },
  VENCIDA: { label: "Vencida", className: "bg-red-100 text-red-700" },
  PARCIAL: { label: "Parcial", className: "bg-amber-100 text-amber-700" },
  // StatusCliente
  ATIVO: { label: "Ativo", className: "bg-green-100 text-green-700" },
  INATIVO: { label: "Inativo", className: "bg-gray-100 text-gray-600" },
  PROSPECTO: { label: "Prospecto", className: "bg-sky-100 text-sky-700" },
};

export default function StatusBadge({ status }: { status: string }) {
  const cfg = configs[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", cfg.className)}>
      {cfg.label}
    </span>
  );
}
