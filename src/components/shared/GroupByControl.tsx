"use client";

import { useState, useRef, useEffect } from "react";
import { Layers, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Valor de agrupamento compartilhado pelas listagens (Pedidos de Compra,
// Documentos de Entrada). "none" = sem agrupamento.
export type GroupByValue = "none" | "fornecedor" | "dia";

const OPTIONS: { value: GroupByValue; label: string }[] = [
  { value: "none", label: "Não agrupar" },
  { value: "fornecedor", label: "Por fornecedor" },
  { value: "dia", label: "Por dia" },
];

// Dropdown compacto para escolher o agrupamento de uma listagem.
export default function GroupByControl({
  value,
  onChange,
}: {
  value: GroupByValue;
  onChange: (v: GroupByValue) => void;
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

  const current = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];
  const active = value !== "none";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 h-9 px-3 text-sm border rounded-lg transition-colors",
          active
            ? "border-blue-300 bg-blue-50 text-blue-700"
            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
        )}
        title="Agrupar registros"
      >
        <Layers className="w-3.5 h-3.5" />
        <span>{active ? current.label : "Agrupar"}</span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
      </button>

      {open && (
        <div className="absolute left-0 top-10 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 w-48">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <span>{o.label}</span>
              {value === o.value && <Check className="w-3.5 h-3.5 text-blue-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
