"use client";
// Controle de ordenação estilo Notion (padrão das tabelas do sistema):
// - ícone ↑↓ na barra da tabela abre o popover "Ordenar por…" (lista de colunas);
// - com ordenação ativa, o chip azul "↑ Coluna" vai para a LINHA DOS FILTROS
//   (portal no slot #erp-sort-slot do FilterBarChips, com divisor à direita);
//   em telas sem FilterBar o chip fica na própria barra da tabela.
// - o gerenciador troca coluna/direção (rótulos por tipo: A→Z, antigo→novo,
//   menor→maior), adiciona ordenações (multi-sort) e exclui tudo.
// O estado é o SortingState da tabela — cliques no cabeçalho e o chip
// compartilham a mesma ordenação.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SortingState } from "@tanstack/react-table";
import { ArrowUp, ArrowDown, ArrowUpDown, Plus, Trash2, X, ChevronDown, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortColumnOpt = {
  id: string;
  label: string;
  // Define os rótulos das direções (padrão: texto).
  tipo?: "texto" | "numero" | "data";
};

/** Id do slot que o FilterBarChips expõe no início da linha de chips. */
export const SORT_SLOT_ID = "erp-sort-slot";

const ROTULOS: Record<NonNullable<SortColumnOpt["tipo"]>, [asc: string, desc: string]> = {
  texto: ["Ordenar A → Z", "Ordenar Z → A"],
  numero: ["Ordenar menor → maior", "Ordenar maior → menor"],
  data: ["Ordenar antigo → novo", "Ordenar novo → antigo"],
};

function rotulosDe(col: SortColumnOpt | undefined): [string, string] {
  return ROTULOS[col?.tipo ?? "texto"];
}

// Observa o DOM até o slot da linha de filtros existir (o FilterBarChips pode
// montar depois da tabela, e o funil esconde/mostra a linha a qualquer momento).
function useSlot(id: string): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const find = () => setEl(document.getElementById(id));
    find();
    const obs = new MutationObserver(find);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [id]);
  return el;
}

// Dropdown compacto no MESMO estilo da lista "Ordenar por…" — substitui o
// select nativo dentro do gerenciador (coluna e direção).
function MiniSelect({ value, options, onChange, className }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  className?: string;
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
        onClick={() => setOpen((v) => !v)}
        className="h-8 w-full flex items-center justify-between gap-1 rounded-md border border-border bg-card px-2 text-xs text-foreground hover:bg-muted transition-colors"
      >
        <span className="truncate">{atual?.label ?? value}</span>
        <ChevronDown className="w-3 h-3 shrink-0 opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-[60] min-w-full w-max max-w-72 max-h-64 overflow-y-auto bg-card border border-border rounded-lg shadow-lg py-1">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className="w-full flex items-center gap-2 pl-2 pr-3 py-1.5 text-xs text-foreground text-left hover:bg-muted"
            >
              <Check className={cn("w-3.5 h-3.5 shrink-0 text-info", o.value === value ? "opacity-100" : "opacity-0")} />
              <span className="truncate">{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SortControl({
  columns,
  sorting,
  onChange,
}: {
  columns: SortColumnOpt[];
  sorting: SortingState;
  onChange: (s: SortingState) => void;
}) {
  // Onde o popover está aberto: no ícone da barra ou no chip da linha de filtros.
  const [anchor, setAnchor] = useState<null | "toolbar" | "slot">(null);
  const [busca, setBusca] = useState("");
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const slotWrapRef = useRef<HTMLSpanElement | null>(null);
  const slot = useSlot(SORT_SLOT_ID);

  useEffect(() => {
    if (!anchor) return;
    function handle(e: MouseEvent) {
      const dentro =
        (toolbarRef.current && toolbarRef.current.contains(e.target as Node)) ||
        (slotWrapRef.current && slotWrapRef.current.contains(e.target as Node));
      if (!dentro) setAnchor(null);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [anchor]);

  useEffect(() => {
    if (!anchor) setBusca("");
  }, [anchor]);

  const byId = new Map(columns.map((c) => [c.id, c]));
  const usados = new Set(sorting.map((s) => s.id));
  const disponiveis = columns.filter((c) => !usados.has(c.id));
  const primeiro = sorting[0];
  const labelDe = (id: string) => byId.get(id)?.label ?? id;
  const portaled = sorting.length > 0 && !!slot;

  const filtradas = disponiveis.filter((c) =>
    c.label.toLowerCase().includes(busca.trim().toLowerCase())
  );

  const chip = (
    <button
      type="button"
      onClick={() => setAnchor((a) => (a === "slot" ? null : "slot"))}
      className="h-7 inline-flex items-center gap-1 rounded-full border border-info/30 bg-info/10 px-2.5 text-xs font-medium text-info hover:bg-info/15 transition-colors whitespace-nowrap"
    >
      {primeiro?.desc ? <ArrowDown className="w-3.5 h-3.5" /> : <ArrowUp className="w-3.5 h-3.5" />}
      {primeiro && labelDe(primeiro.id)}
      {sorting.length > 1 && <span className="opacity-70">+{sorting.length - 1}</span>}
      <ChevronDown className="w-3 h-3 opacity-70" />
    </button>
  );

  const popover = (alignClass: string) => (
    <div className={cn("absolute top-full mt-2 z-50 w-80 bg-card rounded-xl border border-border shadow-xl", alignClass)}>
      {sorting.length === 0 ? (
        /* ── Escolha inicial: "Ordenar por…" ─────────────────────────────── */
        <div>
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                autoFocus
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Ordenar por…"
                className="w-full pl-8 pr-2 h-8 text-sm bg-transparent border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {filtradas.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">Nenhuma coluna encontrada</p>
            )}
            {filtradas.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onChange([{ id: c.id, desc: false }])}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-muted text-left"
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                {c.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* ── Gerenciador: linhas de ordenação + ações ───────────────────── */
        <div className="p-2 space-y-1.5">
          {sorting.map((s, i) => {
            const col = byId.get(s.id);
            const [asc, desc] = rotulosDe(col);
            return (
              <div key={`${s.id}-${i}`} className="flex items-center gap-1.5">
                <MiniSelect
                  className="flex-1 min-w-0"
                  value={s.id}
                  options={[
                    ...(col ? [col] : [{ id: s.id, label: s.id }]),
                    ...disponiveis,
                  ].map((c) => ({ value: c.id, label: c.label }))}
                  onChange={(v) => {
                    const next = [...sorting];
                    next[i] = { ...next[i], id: v };
                    onChange(next);
                  }}
                />
                <MiniSelect
                  className="w-44 shrink-0"
                  value={s.desc ? "desc" : "asc"}
                  options={[{ value: "asc", label: asc }, { value: "desc", label: desc }]}
                  onChange={(v) => {
                    const next = [...sorting];
                    next[i] = { ...next[i], desc: v === "desc" };
                    onChange(next);
                  }}
                />
                <button
                  type="button"
                  title="Remover esta ordenação"
                  onClick={() => {
                    const next = sorting.filter((_, j) => j !== i);
                    onChange(next);
                    if (next.length === 0) setAnchor(null);
                  }}
                  className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}

          <div className="pt-1 border-t border-border space-y-0.5">
            <button
              type="button"
              disabled={disponiveis.length === 0}
              onClick={() => {
                const prox = disponiveis[0];
                if (prox) onChange([...sorting, { id: prox.id, desc: false }]);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md text-left disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar ordenação
            </button>
            <button
              type="button"
              onClick={() => { onChange([]); setAnchor(null); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:text-danger hover:bg-danger/10 rounded-md text-left"
            >
              <Trash2 className="w-3.5 h-3.5" /> Excluir ordenação
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Âncora da barra da tabela: ícone ↑↓ (azul quando há ordenação); em telas
          sem FilterBar o chip fica aqui mesmo. */}
      <div className="relative flex items-center gap-2" ref={toolbarRef}>
        {sorting.length > 0 && !portaled && chipToolbar(sorting, primeiro, labelDe, () => setAnchor((a) => (a === "toolbar" ? null : "toolbar")))}
        <button
          type="button"
          title="Ordenar"
          onClick={() => setAnchor((a) => (a === "toolbar" ? null : "toolbar"))}
          className={cn(
            "h-8 w-8 inline-flex items-center justify-center rounded-md border transition-colors",
            sorting.length > 0
              ? "border-blue-300 bg-info/10 text-info"
              : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
        >
          <ArrowUpDown className="w-4 h-4" />
        </button>
        {anchor === "toolbar" && popover("right-0")}
      </div>

      {/* Chip na linha dos filtros (estilo Notion), com divisor à direita. */}
      {portaled && slot && createPortal(
        <span className="inline-flex items-center gap-1.5 relative" ref={slotWrapRef}>
          {chip}
          <span className="h-4 w-px bg-border mx-0.5" />
          {anchor === "slot" && popover("left-0")}
        </span>,
        slot,
      )}
    </>
  );
}

// Chip de fallback na barra da tabela (tela sem FilterBar) — mesmo visual do
// chip da linha de filtros, só muda a âncora do popover.
function chipToolbar(
  sorting: SortingState,
  primeiro: SortingState[number] | undefined,
  labelDe: (id: string) => string,
  onClick: () => void,
) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 inline-flex items-center gap-1 rounded-full border border-info/30 bg-info/10 px-2.5 text-xs font-medium text-info hover:bg-info/15 transition-colors whitespace-nowrap"
    >
      {primeiro?.desc ? <ArrowDown className="w-3.5 h-3.5" /> : <ArrowUp className="w-3.5 h-3.5" />}
      {primeiro && labelDe(primeiro.id)}
      {sorting.length > 1 && <span className="opacity-70">+{sorting.length - 1}</span>}
      <ChevronDown className="w-3 h-3 opacity-70" />
    </button>
  );
}
