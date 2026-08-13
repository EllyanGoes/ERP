"use client";
// Dropdown PADRÃO do sistema para escolhas fixas (enum/filtro/lista curta) —
// substitui o <select> nativo em TODAS as telas (decisão de produto 13/08/2026:
// o popup nativo do navegador destoa do visual; o modelo é o do seletor de
// empresas do topo). Para listas de entidades com busca/criação continue usando
// ComboboxWithCreate.
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectMenuOption = {
  value: string;
  label: string;
  /** Render custom da linha (ex.: ícone + texto). Default: label. */
  render?: () => React.ReactNode;
};

export default function SelectMenu({
  value,
  options,
  onChange,
  placeholder = "Selecionar…",
  className,
  triggerClassName,
  menuClassName,
  disabled,
  title,
}: {
  value: string;
  options: SelectMenuOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const atual = options.find((o) => o.value === value);

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        type="button"
        disabled={disabled}
        title={title}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "h-9 w-full flex items-center justify-between gap-1.5 rounded-lg border border-border bg-card px-2.5 text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-60",
          triggerClassName,
        )}
      >
        <span className={cn("truncate", !atual && "text-muted-foreground")}>{atual?.label ?? placeholder}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" />
      </button>
      {open && (
        <div className={cn(
          "absolute left-0 top-full mt-1 z-50 min-w-full w-max max-w-80 max-h-72 overflow-y-auto bg-card border border-border rounded-xl shadow-xl py-1",
          menuClassName,
        )}>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className="w-full flex items-center gap-2 pl-2.5 pr-3.5 py-1.5 text-sm text-foreground text-left hover:bg-muted"
            >
              <Check className={cn("w-3.5 h-3.5 shrink-0 text-info", o.value === value ? "opacity-100" : "opacity-0")} />
              <span className="truncate">{o.render ? o.render() : o.label}</span>
            </button>
          ))}
          {options.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Nenhuma opção.</p>}
        </div>
      )}
    </div>
  );
}
