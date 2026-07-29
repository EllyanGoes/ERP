"use client";
// Controle de ordenação estilo Notion (padrão das tabelas do sistema):
// - sem ordenação: ícone ↑↓ abre o popover "Ordenar por…" com a lista de colunas;
// - com ordenação: chip azul "↑ Coluna" abre o gerenciador — trocar coluna,
//   direção (rótulos por tipo: A→Z, antigo→novo, menor→maior), adicionar
//   ordenações (multi-sort do tanstack) e excluir tudo.
// O estado é o SortingState da tabela — cliques no cabeçalho e o chip
// compartilham a mesma ordenação.
import { useEffect, useRef, useState } from "react";
import type { SortingState } from "@tanstack/react-table";
import { ArrowUp, ArrowDown, ArrowUpDown, Plus, Trash2, X, ChevronDown, Search } from "lucide-react";

export type SortColumnOpt = {
  id: string;
  label: string;
  // Define os rótulos das direções (padrão: texto).
  tipo?: "texto" | "numero" | "data";
};

const ROTULOS: Record<NonNullable<SortColumnOpt["tipo"]>, [asc: string, desc: string]> = {
  texto: ["Ordenar A → Z", "Ordenar Z → A"],
  numero: ["Ordenar menor → maior", "Ordenar maior → menor"],
  data: ["Ordenar antigo → novo", "Ordenar novo → antigo"],
};

function rotulosDe(col: SortColumnOpt | undefined): [string, string] {
  return ROTULOS[col?.tipo ?? "texto"];
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
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  useEffect(() => {
    if (!open) setBusca("");
  }, [open]);

  const byId = new Map(columns.map((c) => [c.id, c]));
  const usados = new Set(sorting.map((s) => s.id));
  const disponiveis = columns.filter((c) => !usados.has(c.id));
  const primeiro = sorting[0];
  const labelDe = (id: string) => byId.get(id)?.label ?? id;

  const filtradas = disponiveis.filter((c) =>
    c.label.toLowerCase().includes(busca.trim().toLowerCase())
  );

  return (
    <div className="relative" ref={ref}>
      {sorting.length === 0 ? (
        <button
          type="button"
          title="Ordenar"
          onClick={() => setOpen((v) => !v)}
          className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ArrowUpDown className="w-4 h-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="h-8 inline-flex items-center gap-1 rounded-full border border-info/30 bg-info/10 px-2.5 text-xs font-medium text-info hover:bg-info/15 transition-colors whitespace-nowrap"
        >
          {primeiro.desc ? <ArrowDown className="w-3.5 h-3.5" /> : <ArrowUp className="w-3.5 h-3.5" />}
          {labelDe(primeiro.id)}
          {sorting.length > 1 && <span className="opacity-70">+{sorting.length - 1}</span>}
          <ChevronDown className="w-3 h-3 opacity-70" />
        </button>
      )}

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 bg-card rounded-xl border border-border shadow-xl overflow-hidden">
          {sorting.length === 0 ? (
            /* ── Escolha inicial: "Ordenar por…" ─────────────────────────── */
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
            /* ── Gerenciador: linhas de ordenação + ações ─────────────────── */
            <div className="p-2 space-y-1.5">
              {sorting.map((s, i) => {
                const col = byId.get(s.id);
                const [asc, desc] = rotulosDe(col);
                return (
                  <div key={`${s.id}-${i}`} className="flex items-center gap-1.5">
                    <select
                      value={s.id}
                      onChange={(e) => {
                        const next = [...sorting];
                        next[i] = { ...next[i], id: e.target.value };
                        onChange(next);
                      }}
                      className="h-8 flex-1 min-w-0 rounded-md border border-border bg-card px-1.5 text-xs text-foreground"
                    >
                      {/* a coluna atual + as ainda não usadas */}
                      {[...(col ? [col] : []), ...disponiveis].map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                      {/* ordenação vinda do cabeçalho p/ coluna fora da lista */}
                      {!col && <option value={s.id}>{s.id}</option>}
                    </select>
                    <select
                      value={s.desc ? "desc" : "asc"}
                      onChange={(e) => {
                        const next = [...sorting];
                        next[i] = { ...next[i], desc: e.target.value === "desc" };
                        onChange(next);
                      }}
                      className="h-8 w-40 shrink-0 rounded-md border border-border bg-card px-1.5 text-xs text-foreground"
                    >
                      <option value="asc">{asc}</option>
                      <option value="desc">{desc}</option>
                    </select>
                    <button
                      type="button"
                      title="Remover esta ordenação"
                      onClick={() => {
                        const next = sorting.filter((_, j) => j !== i);
                        onChange(next);
                        if (next.length === 0) setOpen(false);
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
                  onClick={() => { onChange([]); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:text-danger hover:bg-danger/10 rounded-md text-left"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Excluir ordenação
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
