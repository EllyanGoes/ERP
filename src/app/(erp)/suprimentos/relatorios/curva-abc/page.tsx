"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import FilterDropdown, { FilterOption } from "@/components/shared/FilterDropdown";
import DateRangePicker, { DateRange } from "@/components/shared/DateRangePicker";
import { Search, X, Loader2, Layers, Info, RefreshCw } from "lucide-react";
import Link from "next/link";
import { cn, formatBRL } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────
type LocalEstoque = { id: string; nome: string };

type Row = {
  itemId: string;
  codigo: string;
  descricao: string;
  tipoProduto: string | null;
  unidade: string;
  estoqueAtual: number;
  custo: number;
  valorConsumoAnual: number;
  pctConsumo: number;
  pctAcumulado: number;
  curvaABC: "A" | "B" | "C";
};

type Summary = {
  totalItems: number;
  classA: { count: number; pctItems: number; pctValor: number };
  classB: { count: number; pctItems: number; pctValor: number };
  classC: { count: number; pctItems: number; pctValor: number };
  totalConsumoAnual: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function defaultRange(): DateRange {
  const today = new Date();
  const start = new Date(today);
  start.setMonth(start.getMonth() - 36);
  start.setDate(1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    from: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-01`,
    to:   `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`,
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────
const ABC_OPTIONS: FilterOption[] = [
  { key: "todos", label: "Todas",    color: "bg-muted text-muted-foreground" },
  { key: "A",     label: "Classe A", color: "bg-danger/15 text-danger" },
  { key: "B",     label: "Classe B", color: "bg-warning/15 text-warning" },
  { key: "C",     label: "Classe C", color: "bg-muted text-muted-foreground" },
];

const ABC_STYLES = {
  A: {
    badge:   "bg-danger/15 text-danger border-rose-200",
    row:     "bg-danger/10",
    bar:     "bg-rose-400",
    card:    "border-rose-200 bg-danger/10",
    title:   "text-danger",
    value:   "text-rose-800",
    sub:     "text-rose-500",
    barFull: "bg-rose-400",
  },
  B: {
    badge:   "bg-warning/15 text-warning border-warning/30",
    row:     "",
    bar:     "bg-amber-400",
    card:    "border-warning/30 bg-warning/10",
    title:   "text-warning",
    value:   "text-warning",
    sub:     "text-amber-500",
    barFull: "bg-amber-400",
  },
  C: {
    badge:   "bg-muted text-muted-foreground border-border",
    row:     "",
    bar:     "bg-muted",
    card:    "border-border bg-muted",
    title:   "text-muted-foreground",
    value:   "text-foreground",
    sub:     "text-muted-foreground",
    barFull: "bg-muted",
  },
};

function AbcBadge({ cls }: { cls: "A" | "B" | "C" }) {
  return (
    <span className={cn(
      "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold border",
      ABC_STYLES[cls].badge
    )}>
      {cls}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function CurvaAbcPage() {
  const [rows, setRows]           = useState<Row[]>([]);
  const [summary, setSummary]     = useState<Summary | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [search, setSearch]       = useState("");
  const [abcFilter, setAbcFilter] = useState("todos");
  const [locais, setLocais]       = useState<LocalEstoque[]>([]);
  const [periodo, setPeriodo]     = useState<DateRange>(defaultRange());
  const [localId, setLocalId]     = useState("");

  // Load locais once
  useEffect(() => {
    fetch("/api/suprimentos/locais-estoque")
      .then((r) => r.json())
      .then((d) => setLocais(Array.isArray(d) ? d : []));
  }, []);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (periodo.from) params.set("dataInicio", periodo.from);
    if (periodo.to)   params.set("dataFim",    periodo.to);
    if (localId)      params.set("localId",    localId);
    fetch(`/api/suprimentos/relatorios/caracterizacao?${params}`)
      .then((r) => r.json())
      .then((d) => { setRows(d.rows ?? []); setSummary(d.summary ?? null); })
      .catch(() => setError("Erro ao carregar dados"))
      .finally(() => setLoading(false));
  }, [periodo, localId]);

  // Fetch whenever periodo or localId change.
  // Skip while the date picker is mid-selection (from set but to still empty).
  useEffect(() => {
    if (periodo.from && !periodo.to) return;
    fetchData();
  }, [fetchData, periodo.from, periodo.to]);

  const LOCAL_OPTIONS: FilterOption[] = [
    { key: "",    label: "Todos os locais", color: "bg-muted text-muted-foreground" },
    ...locais.map((l) => ({ key: l.id, label: l.nome, color: "bg-info/15 text-info" })),
  ];

  const hasFilters = !!(search || abcFilter !== "todos" || localId);

  const filtered = useMemo(() => rows.filter((r) => {
    if (abcFilter !== "todos" && r.curvaABC !== abcFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!r.codigo.toLowerCase().includes(q) && !r.descricao.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [rows, abcFilter, search]);

  const filteredTotal = filtered.reduce((s, r) => s + r.valorConsumoAnual, 0);

  return (
    <div>
      <PageHeader
        title="Curva ABC"
        breadcrumbs={[{ label: "Almoxarifado" }, { label: "Relatórios" }, { label: "Curva ABC" }]}
      />

      <div className="px-8 pb-8 space-y-6">

        {/* ── Filters (top) ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={periodo} onChange={setPeriodo} />
          <FilterDropdown
            label="Local de Estoque"
            options={LOCAL_OPTIONS}
            value={localId}
            onChange={setLocalId}
            allKey=""
            placeholder="Todos os locais..."
          />
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>

          <div className="w-px h-6 bg-muted mx-1" />

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text" value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto..."
              className="pl-9 pr-8 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-52"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <FilterDropdown label="Classe" options={ABC_OPTIONS} value={abcFilter} onChange={setAbcFilter} allKey="todos" placeholder="Classe..." />
          {hasFilters && (
            <button onClick={() => { setSearch(""); setAbcFilter("todos"); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-muted-foreground">
              <X className="w-3 h-3" /> Limpar
            </button>
          )}
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-xl text-sm">{error}</div>
        )}

        {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
        {summary && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

              {/* Total */}
              <div className="rounded-xl border border-border bg-card px-5 py-4">
                <p className="text-xs text-muted-foreground font-medium">Total de Itens</p>
                <p className="text-3xl font-bold text-foreground mt-1">{summary.totalItems}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatBRL(summary.totalConsumoAnual)}<span className="text-muted-foreground/60"> /ano</span>
                </p>
              </div>

              {(["A", "B", "C"] as const).map((cls) => {
                const s  = ABC_STYLES[cls];
                const cl = summary[`class${cls}` as "classA" | "classB" | "classC"];
                const labels = {
                  A: "Alta criticidade · 10-20% dos itens",
                  B: "Média criticidade · ~30% dos itens",
                  C: "Baixa criticidade · ~50% dos itens",
                };
                return (
                  <div key={cls} className={cn("rounded-xl border px-5 py-4", s.card)}>
                    <div className="flex items-center justify-between mb-1">
                      <p className={cn("text-xs font-semibold", s.title)}>Classe {cls}</p>
                      <AbcBadge cls={cls} />
                    </div>
                    <p className={cn("text-3xl font-bold mt-1", s.value)}>{cl.count}</p>
                    <p className={cn("text-xs mt-1", s.sub)}>
                      {cl.pctItems}% dos itens · ~{cl.pctValor}% do valor
                    </p>
                    <p className={cn("text-xs mt-0.5 font-medium", s.sub)}>
                      {formatBRL(summary.totalConsumoAnual * (cl.pctValor / 100))}<span className="font-normal opacity-60"> /ano</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">{labels[cls]}</p>
                  </div>
                );
              })}
            </div>

            {/* Distribution bar */}
            <div className="rounded-xl border border-border bg-card px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-muted-foreground">Distribuição do Valor de Consumo Anual</p>
                <p className="text-xs text-muted-foreground font-medium">Total: {formatBRL(summary.totalConsumoAnual)} / ano</p>
              </div>

              <div className="flex h-7 rounded-lg overflow-hidden gap-px">
                {(["A", "B", "C"] as const).map((cls) => {
                  const cl  = summary[`class${cls}` as "classA" | "classB" | "classC"];
                  const pct = cl.pctValor;
                  if (pct === 0) return null;
                  return (
                    <div
                      key={cls}
                      className={cn(
                        "flex items-center justify-center text-white text-xs font-bold transition-all",
                        ABC_STYLES[cls].barFull
                      )}
                      style={{ width: `${pct}%` }}
                      title={`Classe ${cls}: ${pct}%`}
                    >
                      {pct >= 7 ? `${cls} · ${pct}%` : ""}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-4 mt-3">
                {(["A", "B", "C"] as const).map((cls) => (
                  <span key={cls} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn("w-3 h-3 rounded shrink-0", ABC_STYLES[cls].barFull)} />
                    Classe {cls} — {summary[`class${cls}` as "classA" | "classB" | "classC"].count} itens
                    ({summary[`class${cls}` as "classA" | "classB" | "classC"].pctValor}% do valor)
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}


        {/* ── Table ─────────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
            <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">{hasFilters ? "Nenhum item encontrado" : "Nenhum item cadastrado"}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium w-8">#</th>
                  <th className="text-left px-4 py-3 font-medium">Código</th>
                  <th className="text-left px-4 py-3 font-medium">Descrição</th>
                  <th className="text-left px-4 py-3 font-medium">Und.</th>
                  <th className="text-center px-4 py-3 font-medium">Classe</th>
                  <th className="text-right px-4 py-3 font-medium">% do Valor</th>
                  <th className="text-right px-4 py-3 font-medium">% Acumulado</th>
                  <th className="text-right px-4 py-3 font-medium">Consumo Anual</th>
                  <th className="text-right px-4 py-3 font-medium">Custo Unit.</th>
                  <th className="text-right px-4 py-3 font-medium">Estoque Atual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((row, idx) => {
                  const s = ABC_STYLES[row.curvaABC];
                  return (
                    <tr key={row.itemId} className={cn("hover:bg-muted transition-colors", row.curvaABC === "A" && idx < 5 && "bg-danger/10")}>
                      <td className="px-4 py-3 text-xs text-muted-foreground/60 text-right tabular-nums">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <Link href={`/suprimentos/produtos/${row.itemId}`} className="font-mono text-xs text-info hover:underline">
                          {row.codigo}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-foreground font-medium">
                        {row.descricao}
                        {row.tipoProduto && <span className="ml-2 text-xs text-muted-foreground font-normal">{row.tipoProduto}</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs font-mono">{row.unidade}</td>
                      <td className="px-4 py-3 text-center"><AbcBadge cls={row.curvaABC} /></td>

                      {/* % do valor */}
                      <td className="px-4 py-3 text-right">
                        <span className={cn("text-xs tabular-nums font-medium", s.title)}>
                          {row.pctConsumo.toFixed(2)}%
                        </span>
                      </td>

                      {/* % acumulado com barra */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-24 bg-muted rounded-full h-2 hidden sm:block overflow-hidden">
                            <div
                              className={cn("h-2 rounded-full transition-all", s.barFull)}
                              style={{ width: `${Math.min(row.pctAcumulado, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
                            {row.pctAcumulado.toFixed(1)}%
                          </span>
                        </div>
                      </td>

                      {/* Consumo anual */}
                      <td className="px-4 py-3 text-right">
                        <span className={cn("text-sm tabular-nums font-semibold", row.valorConsumoAnual > 0 ? s.value : "text-muted-foreground/60")}>
                          {row.valorConsumoAnual > 0 ? formatBRL(row.valorConsumoAnual) : "—"}
                        </span>
                      </td>

                      {/* Custo unitário */}
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">
                        {row.custo > 0 ? formatBRL(row.custo) : <span className="text-muted-foreground/60">—</span>}
                      </td>

                      {/* Estoque */}
                      <td className="px-4 py-3 text-right">
                        <span className={cn("text-sm tabular-nums font-medium", row.estoqueAtual <= 0 ? "text-muted-foreground/60" : "text-foreground")}>
                          {row.estoqueAtual > 0
                            ? row.estoqueAtual.toLocaleString("pt-BR", { maximumFractionDigits: 3 })
                            : "0"}
                          <span className="text-xs font-normal text-muted-foreground ml-1">{row.unidade}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {filtered.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted">
                    <td colSpan={7} className="px-4 py-2.5 text-xs font-medium text-muted-foreground">
                      {filtered.length} {filtered.length === 1 ? "item" : "itens"}
                      {hasFilters && rows.length !== filtered.length && ` (de ${rows.length})`}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold text-foreground tabular-nums">
                      {formatBRL(filteredTotal)}
                      <span className="text-xs font-normal text-muted-foreground ml-1">/ano</span>
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* ── Metodologia ───────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-muted px-5 py-4">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-muted-foreground leading-relaxed">
              <p className="font-semibold text-foreground">Metodologia — Curva ABC (Princípio de Pareto)</p>
              <p>
                Os itens são ordenados pelo <strong>Valor de Consumo Anual</strong> (saídas × custo unitário no período selecionado, anualizado).
                O percentual acumulado determina a classe: <strong className="text-danger">A</strong> até 80% do valor total,
                <strong className="text-warning"> B</strong> de 80% a 95%, e <strong className="text-muted-foreground">C</strong> o restante.
                Itens sem saídas registradas recebem valor de consumo zero e são classificados como <strong>C</strong>.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
