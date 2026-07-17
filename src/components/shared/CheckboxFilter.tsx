"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type CheckOption = { value: string; label: string; hint?: string };

/**
 * Filtro de MÚLTIPLA seleção no estilo das listagens (Documentos de Entrada):
 * botão com "N <noun>" + popover com checkboxes e "Selecionar/Desmarcar todos".
 * `values` é a lista de valores marcados; vazio = nenhum.
 */
export default function CheckboxFilter({
  values,
  onChange,
  options,
  noun = "itens",
  menuWidth = "w-56",
  className,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  options: CheckOption[];
  noun?: string;
  menuWidth?: string;
  className?: string;
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

  const todos = options.map((o) => o.value);
  const label =
    values.length === options.length ? `${options.length} ${noun}`
    : values.length === 0 ? `Nenhum ${noun}`
    : values.length === 1 ? (options.find((o) => o.value === values[0])?.label ?? `1 ${noun}`)
    : `${values.length} ${noun}`;
  const active = values.length !== options.length;

  function toggleOne(v: string) {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  }

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
        <span>{label}</span>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div className={cn("absolute left-0 top-10 z-20 bg-card border border-border rounded-xl shadow-lg py-1.5", menuWidth)}>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted font-medium"
            onClick={() => onChange(values.length === options.length ? [] : todos)}
          >
            {values.length === options.length ? "Desmarcar todos" : "Selecionar todos"}
          </button>
          <div className="border-t border-border mt-1 pt-1">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted"
                onClick={() => toggleOne(o.value)}
              >
                <span className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                  values.includes(o.value) ? "bg-blue-600 border-blue-600" : "border-border",
                )}>
                  {values.includes(o.value) && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="flex-1 text-left text-foreground">{o.label}</span>
                {o.hint != null && <span className="text-xs text-muted-foreground tabular-nums">{o.hint}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
