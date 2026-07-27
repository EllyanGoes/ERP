"use client";
/**
 * ColumnConfigurator
 *
 * Botão + popover para reordenar e mostrar/ocultar colunas.
 *
 * Uso:
 *   <ColumnConfigurator
 *     columns={COLS}
 *     order={order}
 *     onOrderChange={setOrder}
 *     visibility={visibility}          // Record<id, boolean>
 *     onVisibilityChange={setVis}      // (id, visible) => void
 *     onShowAll={showAll}              // () => void
 *   />
 *
 * ColDef<T> é exportado para que as páginas possam tipar seus arrays de colunas.
 */

import { useState } from "react";
import {
  SlidersHorizontal, GripVertical, RotateCcw,
  Eye, EyeOff, Search,
} from "lucide-react";
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
  /** All available columns (id + label) */
  columns: { id: string; label: string }[];
  /** Current order (array of all ids, visible + hidden) */
  order: string[];
  /** Callback when user reorders */
  onOrderChange: (newOrder: string[]) => void;
  /** Record<id, boolean> — true = visible (default when absent) */
  visibility?: Record<string, boolean>;
  /** Called when user toggles a column */
  onVisibilityChange?: (id: string, visible: boolean) => void;
  /** Called when user clicks "Mostrar tudo" */
  onShowAll?: () => void;
}

export default function ColumnConfigurator({
  columns, order, onOrderChange,
  visibility = {}, onVisibilityChange, onShowAll,
}: Props) {
  const [open, setOpen] = useState(false);
  // Busca (estilo Notion: "Procurar uma propriedade…") — filtra as duas listas.
  const [busca, setBusca] = useState("");

  // Drag state (only visible columns are draggable)
  const [dragIdx,     setDragIdx]     = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // All cols in current order
  const orderedAll = order
    .map((id) => columns.find((c) => c.id === id))
    .filter((c): c is { id: string; label: string } => c !== undefined);

  const q = busca.trim().toLowerCase();
  const casaBusca = (c: { label: string }) => !q || c.label.toLowerCase().includes(q);
  const visible = orderedAll.filter((c) => visibility[c.id] !== false);
  const hidden  = orderedAll.filter((c) => visibility[c.id] === false);
  const visibleFiltradas = visible.filter(casaBusca);
  const hiddenFiltradas  = hidden.filter(casaBusca);

  function handleDrop(toIdx: number) {
    if (dragIdx === null || dragIdx === toIdx) return;
    // Reorder only among visible cols; keep hidden cols in their relative positions
    const visIds = visible.map((c) => c.id);
    const [moved] = visIds.splice(dragIdx, 1);
    visIds.splice(toIdx, 0, moved);
    // Rebuild full order: visible first (in new order), then hidden (original rel order)
    const hiddenIds = hidden.map((c) => c.id);
    onOrderChange([...visIds, ...hiddenIds]);
    setDragIdx(null);
    setDragOverIdx(null);
  }

  function resetToDefault() {
    onOrderChange(columns.map((c) => c.id));
    onShowAll?.();
  }

  const hiddenCount = hidden.length;

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Configurar colunas"
        className={cn(
          "flex items-center gap-1.5 h-9 px-3 text-sm border rounded-lg transition-colors",
          open
            ? "bg-info/10 border-blue-300 text-info"
            : "bg-card border-border text-muted-foreground hover:bg-muted",
        )}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span className="hidden sm:inline text-xs font-medium">Colunas</span>
        {hiddenCount > 0 && (
          <span className="flex items-center justify-center w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-bold">
            {hiddenCount}
          </span>
        )}
      </button>

      {/* Popover */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="absolute right-0 top-10 z-50 bg-card border border-border rounded-xl shadow-xl w-64 overflow-hidden">

            {/* Header */}
            <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Colunas
              </span>
              <button
                onClick={resetToDefault}
                title="Restaurar padrão"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-muted-foreground transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Padrão
              </button>
            </div>

            {/* Busca (estilo Notion) */}
            <div className="px-3 py-2 border-b border-border">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Procurar uma coluna…"
                  className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* ── Visible section ────────────────────────────────────────── */}
            <div className="max-h-80 overflow-y-auto">
              <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                  Mostradas na tabela
                </span>
                {onVisibilityChange && visible.length > 1 && (
                  <button
                    onClick={() => visible.forEach((c) => onVisibilityChange(c.id, false))}
                    className="text-[10px] text-blue-500 hover:text-info font-medium"
                  >
                    Ocultar tudo
                  </button>
                )}
              </div>

              {visibleFiltradas.map((col) => {
                const idx = visible.indexOf(col);
                return (
                <div
                  key={col.id}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDragIdx(idx); }}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                  onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
                  onDragLeave={() => setDragOverIdx(null)}
                  onDrop={(e) => { e.preventDefault(); handleDrop(idx); }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 select-none transition-colors text-sm group",
                    dragIdx === idx
                      ? "opacity-40"
                      : dragOverIdx === idx
                      ? "bg-info/10 text-info"
                      : "hover:bg-muted text-foreground",
                  )}
                >
                  <GripVertical className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0 cursor-grab active:cursor-grabbing" />
                  <span className="flex-1 truncate text-sm">{col.label}</span>
                  {onVisibilityChange && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onVisibilityChange(col.id, false); }}
                      title="Ocultar coluna"
                      className="text-muted-foreground/70 hover:text-foreground transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                );
              })}

              {visibleFiltradas.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground italic">
                  Nenhuma coluna visível
                </p>
              )}

              {/* ── Hidden section ─────────────────────────────────────── */}
              {hiddenFiltradas.length > 0 && (
                <>
                  <div className="flex items-center justify-between px-3 pt-3 pb-1 border-t border-border mt-1">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                      Ocultas na tabela
                    </span>
                    {onShowAll && (
                      <button
                        onClick={onShowAll}
                        className="text-[10px] text-blue-500 hover:text-info font-medium"
                      >
                        Mostrar tudo
                      </button>
                    )}
                  </div>

                  {hiddenFiltradas.map((col) => (
                    <div
                      key={col.id}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground group hover:bg-muted transition-colors"
                    >
                      <GripVertical className="w-3.5 h-3.5 text-gray-200 shrink-0" />
                      <span className="flex-1 truncate">{col.label}</span>
                      {onVisibilityChange && (
                        <button
                          onClick={() => onVisibilityChange(col.id, true)}
                          title="Mostrar coluna"
                          className="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                        >
                          <EyeOff className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-3 py-2 border-t border-border bg-muted">
              <p className="text-[11px] text-muted-foreground">Arraste para reordenar · clique no olho para ocultar</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
