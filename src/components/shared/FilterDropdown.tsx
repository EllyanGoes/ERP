"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilterOption = {
  key: string;
  label: string;
  /** Tailwind classes for the colored badge, e.g. "bg-blue-100 text-blue-700" */
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
            ? "bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
            : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50",
          open && !isActive && "border-gray-300 bg-gray-50"
        )}
      >
        <span className="font-medium">{label}</span>

        {isActive && selectedOpt && (
          <>
            <span className="text-gray-400 text-xs">é</span>
            <span
              className={cn(
                "px-1.5 py-0.5 rounded text-xs font-medium",
                selectedOpt.color ?? "bg-gray-100 text-gray-700"
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
        <div className="absolute top-full left-0 mt-1.5 z-50 w-64 bg-white rounded-xl border border-gray-200 shadow-xl shadow-black/5 overflow-hidden">
          {/* Header row */}
          <div className="flex items-center justify-between px-3 pt-2.5 pb-2">
            <span className="text-xs text-gray-500">
              <span className="font-medium text-gray-700">{label}</span> é
            </span>
            {isActive && (
              <button
                onClick={() => select(allKey)}
                className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
              >
                <X className="w-3 h-3" />
                Limpar
              </button>
            )}
          </div>

          {/* Search field */}
          <div className="px-2 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={placeholder}
                autoFocus
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-blue-400 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Options list */}
          <div className="pb-1.5 max-h-52 overflow-y-auto border-t border-gray-100">
            {filteredOpts.length === 0 ? (
              <p className="px-3 py-3 text-xs text-gray-400 text-center">
                Nenhuma opção encontrada
              </p>
            ) : (
              filteredOpts.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => select(opt.key)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-left transition-colors"
                >
                  {/* Checkbox */}
                  <div
                    className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                      value === opt.key
                        ? "bg-blue-500 border-blue-500"
                        : "border-gray-300 bg-white"
                    )}
                  >
                    {value === opt.key && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>

                  {/* Badge */}
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-md text-xs font-medium",
                      opt.color ?? "bg-gray-100 text-gray-700"
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
