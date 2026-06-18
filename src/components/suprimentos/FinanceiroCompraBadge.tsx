import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

// Selo da situação financeira do PEDIDO DE COMPRA (contas a pagar).
const MAP: Record<string, { label: string; cls: string }> = {
  NAO_FATURADO: { label: "Não faturado", cls: "bg-muted text-muted-foreground" },
  A_PAGAR:      { label: "A pagar",       cls: "bg-info/15 text-info" },
  PARCIAL:      { label: "Pago parcial",  cls: "bg-warning/15 text-warning" },
  PAGO:         { label: "Pago",          cls: "bg-success/15 text-success" },
};

export default function FinanceiroCompraBadge({ status, className }: { status?: string | null; className?: string }) {
  const s = MAP[status ?? "NAO_FATURADO"] ?? MAP.NAO_FATURADO;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", s.cls, className)}>
      <Wallet className="w-3 h-3" /> {s.label}
    </span>
  );
}
