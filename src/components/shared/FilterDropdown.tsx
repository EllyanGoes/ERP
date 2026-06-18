"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilterOption = {
  key: string;
  label: string;
  /** Tailwind classes for the colored badge, e.g. "bg-info/15 text-info" */
  color?: string;
};

type Props = {
  /** Label shown on the button */
  label: string;
  options: FilterOption[];
  /** Currently selected key */
  value: string;
  onChange: (val: string) => void;
  /** The key that means "no filter active" — defaults to "todos" */
  allKey?: string;
  placeholder?: string;
};

export default function FilterDropdown({
  label,
  options,
  value,
  onChange,
  allKey = "todos",
  placeholder = "Selecione uma opção...",
}: Props) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState("");
  const ref                 = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const isActive      = value !== allKey;
  const selectedOpt   = options.find((o) => o.key === value);
  const filteredOpts  = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  function select(key: string) {
    onChange(key);
    setOpen(false);
    setSearch("");
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 h-9 px-3 text-sm rounded-lg border transition-colors select-none",
          isActive
            ? "bg-info/10 border-blue-300 text-info hover:bg-info/15"
            : "bg-card border-border text-muted-foreground hover:bg-muted",
          open && !isActive && "border-border bg-muted"
        )}
      >
        <span className="font-medium">{label}</span>

        {isActive && selectedOpt && (
          <>
            <span className="text-muted-foreground text-xs">é</span>
            <span
              className={cn(
                "px-1.5 py-0.5 rounded text-xs font-medium",
                selectedOpt.color ?? "bg-muted text-foreground"
              )}
            >
              {selectedOpt.label}
            </span>
          </>
        )}

        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 transition-transform shrink-0",
            open && "rotate-180"
          )}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 w-64 bg-card rounded-xl border border-border shadow-xl shadow-black/5 overflow-hidden">
          {/* Header row */}
          <div className="flex items-center justify-between px-3 pt-2.5 pb-2">
            <span className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{label}</span> é
            </span>
            {isActive && (
              <button
                onClick={() => select(allKey)}
                className="text-xs text-blue-500 hover:text-info flex items-center gap-0.5"
              >
                <X className="w-3 h-3" />
                Limpar
              </button>
            )}
          </div>

          {/* Search field */}
          <div className="px-2 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={placeholder}
                autoFocus
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-blue-400 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Options list */}
          <div className="pb-1.5 max-h-52 overflow-y-auto border-t border-border">
            {filteredOpts.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground text-center">
                Nenhuma opção encontrada
              </p>
            ) : (
              filteredOpts.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => select(opt.key)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted text-left transition-colors"
                >
                  {/* Checkbox */}
                  <div
                    className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                      value === opt.key
                        ? "bg-blue-500 border-blue-500"
                        : "border-border bg-card"
                    )}
                  >
                    {value === opt.key && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>

                  {/* Badge */}
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-md text-xs font-medium",
                      opt.color ?? "bg-muted text-foreground"
                    )}
                  >
                    {opt.label}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
