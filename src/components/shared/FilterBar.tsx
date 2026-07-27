"use client";

// Barra de filtros PADRÃO do sistema (estilo Notion): o FUNIL na toolbar
// mostra/esconde a LINHA DE CHIPS de filtro. Esconder a linha NÃO desativa os
// filtros — o funil fica azul enquanto houver filtro ativo. Cada chip abre o
// próprio popover; o X remove o chip e limpa o filtro; "+ Filtrar" adiciona os
// que faltam. Visibilidade e chips adicionados persistem por usuário.
//
// Uso (na tela):
//   const bar = useFilterBar("modulo:tela:filtros", ["status"]);
//   const chips: FiltroChip[] = [{ key, label, icon, ativo, limpar, render }];
//   ...toolbar: <FilterBarToggle bar={bar} chips={chips} />
//   ...sob a toolbar: <FilterBarChips bar={bar} chips={chips} />

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ListFilter, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePersistedState } from "@/lib/use-persisted-state";

/** Classes do GATILHO dos controles dentro de um chip (rounded-full compacto). */
export const CHIP_TRIGGER = "h-7 rounded-full text-xs px-2.5";

export type FiltroChip = {
  key: string;
  /** Rótulo no menu "+ Filtrar". */
  label: string;
  /** Ícone no menu "+ Filtrar". */
  icon?: ReactNode;
  /** Filtro com valor aplicado — o chip aparece mesmo sem ter sido adicionado e o funil fica azul. */
  ativo: boolean;
  /** Limpa o filtro (chamado pelo X do chip). */
  limpar: () => void;
  /** O controle do filtro estilizado como chip (use CHIP_TRIGGER no gatilho). */
  render: () => ReactNode;
  /** Chip disponível nesta tela/momento (ex.: lista carregada). Default true. */
  disponivel?: boolean;
};

/** Estado persistido da barra: chips adicionados via "+ Filtrar" + linha visível. */
export function useFilterBar(storageKey: string, chipsIniciais: string[] = []) {
  const [visiveis, setVisiveis] = usePersistedState<string[]>(`${storageKey}:chips`, chipsIniciais);
  const [mostrar, setMostrar] = usePersistedState<boolean>(`${storageKey}:mostrar`, true);
  return { visiveis, setVisiveis, mostrar, setMostrar };
}
export type FilterBarState = ReturnType<typeof useFilterBar>;

/** Botão-FUNIL da toolbar: alterna a linha de chips; azul = há filtro ativo. */
export function FilterBarToggle({ bar, chips, className }: {
  bar: FilterBarState; chips: FiltroChip[]; className?: string;
}) {
  const temAtivo = chips.some((c) => c.disponivel !== false && c.ativo);
  return (
    <button
      type="button"
      onClick={() => bar.setMostrar((v) => !v)}
      title={temAtivo
        ? `Filtros ativos — clique para ${bar.mostrar ? "esconder" : "mostrar"}`
        : bar.mostrar ? "Esconder filtros" : "Mostrar filtros"}
      className={cn(
        "inline-flex items-center justify-center h-9 w-9 rounded-lg border transition-colors shrink-0",
        temAtivo
          ? "border-blue-300 bg-info/10 text-info"
          : bar.mostrar
          ? "border-border bg-muted text-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-muted",
        className,
      )}
    >
      <ListFilter className="w-4 h-4" />
    </button>
  );
}

/** Linha de CHIPS de filtro — renderize logo abaixo da toolbar. */
export function FilterBarChips({ bar, chips }: { bar: FilterBarState; chips: FiltroChip[] }) {
  const disponiveis = chips.filter((c) => c.disponivel !== false);
  if (!bar.mostrar || disponiveis.length === 0) return null;
  const mostrados = disponiveis.filter((c) => bar.visiveis.includes(c.key) || c.ativo);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {mostrados.map((c) => (
        <span key={c.key} className="inline-flex items-center gap-0.5">
          {c.render()}
          <button
            type="button"
            title="Remover filtro"
            onClick={() => { bar.setVisiveis((p) => p.filter((x) => x !== c.key)); c.limpar(); }}
            className="p-1 rounded-full text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <AdicionarFiltro
        opcoes={disponiveis.filter((c) => !mostrados.includes(c))}
        onAdd={(k) => bar.setVisiveis((p) => (p.includes(k) ? p : [...p, k]))}
      />
    </div>
  );
}

// "+ Filtrar": menu com os filtros que ainda não estão na barra.
function AdicionarFiltro({ opcoes, onAdd }: {
  opcoes: FiltroChip[]; onAdd: (k: string) => void;
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
  if (opcoes.length === 0) return null;
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 h-7 px-2 rounded-full text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
        <Plus className="w-3.5 h-3.5" /> Filtrar
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-20 w-44 bg-card border border-border rounded-xl shadow-lg py-1.5">
          {opcoes.map((o) => (
            <button key={o.key} type="button" onClick={() => { onAdd(o.key); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-muted">
              {o.icon} {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
