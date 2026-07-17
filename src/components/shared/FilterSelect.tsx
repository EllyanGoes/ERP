"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string; hint?: string };

/**
 * Dropdown compacto de seleção única no estilo dos filtros das listagens
 * (Documentos de Entrada / Pedidos de Compra): botão com o rótulo atual +
 * popover com as opções e um check no selecionado. `hint` mostra um contador
 * ao lado da opção. `active` destaca o botão quando o filtro sai do padrão.
 */
export default function FilterSelect({
  value,
  onChange,
  options,
  icon,
  active,
  className,
  menuWidth = "w-52",
}: {
  value: string;
  onChange: (v: string) => void;
  options: FilterOption[];
  icon?: ReactNode;
  active?: boolean;
  className?: string;
  menuWidth?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 h-9 px-3 text-sm border rounded-lg transition-colors",
          active
            ? "border-blue-300 bg-info/10 text-info"
            : "border-border bg-card text-foreground hover:bg-muted",
        )}
      >
        {icon}
        <span>{current?.label}</span>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div className={cn("absolute left-0 top-10 z-20 bg-card border border-border rounded-xl shadow-lg py-1.5", menuWidth)}>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className="w-full flex items-center justify-between gap-3 px-3 py-1.5 text-sm text-foreground hover:bg-muted"
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              <span>{o.label}</span>
              <span className="flex items-center gap-2">
                {o.hint != null && <span className="text-xs text-muted-foreground tabular-nums">{o.hint}</span>}
                {value === o.value && <Check className="w-3.5 h-3.5 text-info" />}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
