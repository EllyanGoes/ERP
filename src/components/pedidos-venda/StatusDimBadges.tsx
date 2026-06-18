import { Truck, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

// Selos das duas dimensões do pedido: Entrega (minutas) e Financeiro (contas a
// receber). Usados na lista e no detalhe do pedido.

const ENTREGA: Record<string, { label: string; cls: string }> = {
  PENDENTE: { label: "Entrega pendente", cls: "bg-muted text-muted-foreground" },
  PARCIAL:  { label: "Entrega parcial",  cls: "bg-warning/15 text-warning" },
  ENTREGUE: { label: "Entregue",         cls: "bg-success/15 text-success" },
};

const FINANCEIRO: Record<string, { label: string; cls: string }> = {
  NAO_FATURADO: { label: "Não faturado", cls: "bg-muted text-muted-foreground" },
  A_RECEBER:    { label: "A receber",    cls: "bg-info/15 text-info" },
  PARCIAL:      { label: "Recebido parcial", cls: "bg-warning/15 text-warning" },
  RECEBIDO:     { label: "Recebido",     cls: "bg-success/15 text-success" },
};

export function EntregaBadge({ status, className }: { status?: string | null; className?: string }) {
  const s = ENTREGA[status ?? "PENDENTE"] ?? ENTREGA.PENDENTE;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", s.cls, className)}>
      <Truck className="w-3 h-3" /> {s.label}
    </span>
  );
}

export function FinanceiroBadge({ status, className }: { status?: string | null; className?: string }) {
  const s = FINANCEIRO[status ?? "NAO_FATURADO"] ?? FINANCEIRO.NAO_FATURADO;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", s.cls, className)}>
      <Wallet className="w-3 h-3" /> {s.label}
    </span>
  );
}

export default function StatusDimBadges({
  entrega, financeiro, className,
}: { entrega?: string | null; financeiro?: string | null; className?: string }) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      <EntregaBadge status={entrega} />
      <FinanceiroBadge status={financeiro} />
    </span>
  );
}
