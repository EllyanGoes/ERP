"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORIA_ESTOQUE_VALUES, CATEGORIA_ESTOQUE_LABELS, CATEGORIA_ESTOQUE_ICONS, CATEGORIA_ESTOQUE_CORES } from "@/lib/categoria-estoque-ui";

interface Props {
  /** Valor atual (código da categoria) ou "" para nenhum. */
  value: string;
  onChange: (v: string) => void;
  /** Mostra a opção "Não classificado" (vazio). */
  allowNone?: boolean;
  noneLabel?: string;
  placeholder?: string;
  triggerClassName?: string;
}

// Select de categoria de estoque com ícone por opção (mesmo vocabulário do fluxo).
export default function CategoriaEstoqueSelect({ value, onChange, allowNone, noneLabel = "Não classificado", placeholder = "Selecionar…", triggerClassName }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const SelIcon = value ? CATEGORIA_ESTOQUE_ICONS[value as keyof typeof CATEGORIA_ESTOQUE_ICONS] : null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn("w-full flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-cyan-500", triggerClassName)}
      >
        <span className="flex items-center gap-2 min-w-0">
          {SelIcon ? (
            <>
              <SelIcon className={cn("w-4 h-4 shrink-0", CATEGORIA_ESTOQUE_CORES[value as keyof typeof CATEGORIA_ESTOQUE_CORES])} />
              <span className="truncate text-foreground">{CATEGORIA_ESTOQUE_LABELS[value as keyof typeof CATEGORIA_ESTOQUE_LABELS]}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{allowNone ? noneLabel : placeholder}</span>
          )}
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground/60 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-[60] mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-border bg-card shadow-lg py-1">
          {allowNone && (
            <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted">
              <span className="w-4 h-4 shrink-0" />
              <span className="text-muted-foreground">{noneLabel}</span>
              {!value && <Check className="w-3.5 h-3.5 ml-auto text-cyan-500 shrink-0" />}
            </button>
          )}
          {CATEGORIA_ESTOQUE_VALUES.map((c) => {
            const Icon = CATEGORIA_ESTOQUE_ICONS[c];
            return (
              <button key={c} type="button" onClick={() => { onChange(c); setOpen(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted">
                <Icon className={cn("w-4 h-4 shrink-0", CATEGORIA_ESTOQUE_CORES[c])} />
                <span className="truncate text-foreground">{CATEGORIA_ESTOQUE_LABELS[c]}</span>
                {value === c && <Check className="w-3.5 h-3.5 ml-auto text-cyan-500 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
