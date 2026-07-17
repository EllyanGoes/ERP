"use client";

import { cn } from "@/lib/utils";

// Toggle Global/Por Item usado no cabeçalho do card Itens do Documento de
// Entrada (Local de Estoque, TES, Centro de custo).
export default function ModoToggle({ value, onChange, editable }: {
  value: "GLOBAL" | "POR_ITEM";
  onChange: (v: "GLOBAL" | "POR_ITEM") => void;
  editable: boolean;
}) {
  return (
    <div className="flex items-center border border-border rounded-lg p-0.5 bg-muted w-fit">
      {(["GLOBAL", "POR_ITEM"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => editable && onChange(m)}
          className={cn(
            "px-3 py-1 rounded-md text-xs font-medium transition-colors",
            value === m
              ? "bg-card text-info shadow-sm border border-info/30"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {m === "GLOBAL" ? "Global" : "Por Item"}
        </button>
      ))}
    </div>
  );
}
