"use client";
/**
 * ColumnConfigurator
 *
 * Botão + popover drag-and-drop para reordenar colunas de qualquer tabela.
 *
 * Uso:
 *   <ColumnConfigurator columns={COLS} order={order} onOrderChange={setOrder} />
 *
 * ColDef<T> é exportado para que as páginas possam tipar seus arrays de colunas.
 */

import { useState } from "react";
import { SlidersHorizontal, GripVertical, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import React from "react";

// ── Column definition type ────────────────────────────────────────────────────
export type ColDef<T = unknown> = {
  /** Unique stable identifier */
  id: string;
  /** Header label shown in `<th>` and in the configurator */
  label: string;
  /** Classes applied to the `<th>` element */
  thClass?: string;
  /** Classes applied to each `<td>` element */
  tdClass?: string;
  /** Render function for the cell content */
  render: (row: T) => React.ReactNode;
};

// ── Component ────────────────────────────────────────────────────────────────
interface Props {
  /** All available columns (id + label only needed) */
  columns: { id: string; label: string }[];
  /** Current order (array of ids) */
  order: string[];
  /** Callback when user reorders */
  onOrderChange: (newOrder: string[]) => void;
}

export default function ColumnConfigurator({ columns, order, onOrderChange }: Props) {
  const [open, setOpen] = useState(false);

  // Drag state
  const [dragIdx,     setDragIdx]     = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Resolve ordered column list (filter out any id not present in columns)
  const orderedCols = order
    .map((id) => columns.find((c) => c.id === id))
    .filter((c): c is { id: string; label: string } => c !== undefined);

  function handleDrop(toIdx: number) {
    if (dragIdx === null || dragIdx === toIdx) return;
    const ids = orderedCols.map((c) => c.id);
    const [moved] = ids.splice(dragIdx, 1);
    ids.splice(toIdx, 0, moved);
    onOrderChange(ids);
    setDragIdx(null);
    setDragOverIdx(null);
  }

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Configurar colunas"
        className={cn(
          "flex items-center gap-1.5 h-9 px-3 text-sm border rounded-lg transition-colors",
          open
            ? "bg-blue-50 border-blue-300 text-blue-700"
            : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50",
        )}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span className="hidden sm:inline text-xs font-medium">Colunas</span>
      </button>

      {/* Popover */}
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="absolute right-0 top-10 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-60 overflow-hidden">
            {/* Header */}
            <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Ordem das colunas
              </span>
              <button
                onClick={() => onOrderChange(columns.map((c) => c.id))}
                title="Restaurar padrão"
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Padrão
              </button>
            </div>

            {/* Sortable list */}
            <div className="py-1 max-h-80 overflow-y-auto">
              {orderedCols.map((col, idx) => (
                <div
                  key={col.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    setDragIdx(idx);
                  }}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                  onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
                  onDragLeave={() => setDragOverIdx(null)}
                  onDrop={(e) => { e.preventDefault(); handleDrop(idx); }}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 cursor-grab active:cursor-grabbing select-none transition-colors text-sm",
                    dragIdx === idx
                      ? "opacity-40"
                      : dragOverIdx === idx
                      ? "bg-blue-50 text-blue-700"
                      : "hover:bg-gray-50 text-gray-700",
                  )}
                >
                  <GripVertical className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                  <span className="truncate">{col.label}</span>
                </div>
              ))}
            </div>

            {/* Footer hint */}
            <div className="px-3 py-2 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-400">Arraste para reordenar</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
