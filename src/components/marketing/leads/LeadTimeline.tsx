"use client";

import { cn, formatDateTime } from "@/lib/utils";
import {
  Sparkles, ArrowRight, StickyNote, Phone, Trophy, XCircle, UserCheck, ShoppingCart, CircleDot,
  type LucideIcon,
} from "lucide-react";

export type LeadEvento = {
  id: string;
  tipo: string;
  descricao: string | null;
  dados?: unknown;
  criadoPor?: string | null;
  createdAt: string;
};

const ICONES: Record<string, { Icon: LucideIcon; cls: string }> = {
  CRIACAO: { Icon: Sparkles, cls: "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400" },
  MUDANCA_ETAPA: { Icon: ArrowRight, cls: "bg-muted text-muted-foreground" },
  NOTA: { Icon: StickyNote, cls: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" },
  CONTATO: { Icon: Phone, cls: "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400" },
  GANHO: { Icon: Trophy, cls: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" },
  PERDIDO: { Icon: XCircle, cls: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400" },
  CONVERSAO_CLIENTE: { Icon: UserCheck, cls: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" },
  CONVERSAO_PEDIDO: { Icon: ShoppingCart, cls: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" },
};

/** Data relativa em pt-BR ("há 3 dias", "há 2 horas"). */
export function tempoRelativo(data: string | Date): string {
  const d = new Date(data);
  if (isNaN(d.getTime())) return "";
  const diff = (d.getTime() - Date.now()) / 1000; // negativo no passado
  const abs = Math.abs(diff);
  if (abs < 60) return "agora há pouco";
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  if (abs < 86400 * 365) return rtf.format(Math.round(diff / (86400 * 30)), "month");
  return rtf.format(Math.round(diff / (86400 * 365)), "year");
}

export default function LeadTimeline({ eventos }: { eventos: LeadEvento[] }) {
  if (!eventos?.length) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Nenhum evento registrado.</p>;
  }
  return (
    <ul className="space-y-0">
      {eventos.map((ev, i) => {
        const cfg = ICONES[ev.tipo] ?? { Icon: CircleDot, cls: "bg-muted text-muted-foreground" };
        return (
          <li key={ev.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", cfg.cls)}>
                <cfg.Icon className="h-3.5 w-3.5" />
              </span>
              {i < eventos.length - 1 && <span className="w-px flex-1 bg-border my-1" />}
            </div>
            <div className="pb-5 min-w-0">
              <p className="text-sm text-foreground leading-snug">{ev.descricao || ev.tipo}</p>
              <p className="text-xs text-muted-foreground mt-0.5" title={formatDateTime(ev.createdAt)}>
                {tempoRelativo(ev.createdAt)}
                {ev.criadoPor ? ` · ${ev.criadoPor}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
