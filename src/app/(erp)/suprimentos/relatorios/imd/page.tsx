"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import FilterDropdown, { FilterOption } from "@/components/shared/FilterDropdown";
import DateRangePicker, { DateRange } from "@/components/shared/DateRangePicker";
import { Search, X, Loader2, Package, Truck, AlertTriangle, Info, Layers, RefreshCw } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

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
  mesesComConsumo: number;
  mesesSemConsumo: number;
  imd: number;
  categoriaIMD: "ESTOCAVEL" | "MTO" | "OBSOLETO";
};

type Summary = {
  totalItems: number;
  estocavel: number;
  mto: number;
  obsoleto: number;
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
const IMD_OPTIONS: FilterOption[] = [
  { key: "todos",     label: "Todas",                color: "bg-gray-100 text-gray-600" },
  { key: "ESTOCAVEL", label: "Estocável  (IMD > 5)", color: "bg-emerald-100 text-emerald-700" },
  { key: "MTO",       label: "MTO  (IMD 2 a 5)",     color: "bg-blue-100 text-blue-700" },
  { key: "OBSOLETO",  label: "Obsoleto  (IMD < 2)",  color: "bg-red-100 text-red-700" },
];

const CAT_STYLES = {
  ESTOCAVEL: {
    badge:   "bg-emerald-100 text-emerald-700",
    card:    "border-emerald-200 bg-emerald-50",
    title:   "text-emerald-700",
    value:   "text-emerald-800",
    sub:     "text-emerald-600",
    imd:     "text-emerald-700 font-bold",
    icon:    <Package className="w-5 h-5 text-emerald-600" />,
    iconBg:  "bg-emerald-100",
    label:   "Estocável",
    range:   "IMD > 5",
    hint:    "Alta frequência — deve permanecer em estoque.",
  },
  MTO: {
    badge:   "bg-blue-100 text-blue-700",
    card:    "border-blue-200 bg-blue-50",
    title:   "text-blue-700",
    value:   "text-blue-800",
    sub:     "text-blue-600",
    imd:     "text-blue-700 font-bold",
    icon:    <Truck className="w-5 h-5 text-blue-600" />,
    iconBg:  "bg-blue-100",
    label:   "MTO — Make to Order",
    range:   "IMD entre 2 e 5",
    hint:    "Demanda irregular — comprar conforme necessidade.",
  },
  OBSOLETO: {
    badge:   "bg-red-100 text-red-700",
    card:    "border-red-200 bg-red-50",
    title:   "text-red-700",
    value:   "text-red-800",
    sub:     "text-red-600",
    imd:     "text-red-600 font-bold",
    icon:    <AlertTriangle className="w-5 h-5 text-red-600" />,
    iconBg:  "bg-red-100",
    label:   "Obsoleto",
    range:   "IMD < 2",
    hint:    "Baixíssima demanda — reavaliar necessidade de estoque.",
  },
};

function ImdBadge({ cat }: { cat: "ESTOCAVEL" | "MTO" | "OBSOLETO" }) {
  const s = CAT_STYLES[cat];
  return (
    <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold", s.badge)}>
      {s.label}
    </span>
  );
}

function imdBar(imd: number) {
  // Map IMD to a 0-100 visual scale. Cap at 10 for display.
  const pct = imd >= 999 ? 100 : Math.min((imd / 10) * 100, 100);
  let color = "bg-red-400";
  if (imd > 5)  color = "bg-emerald-400";
  else if (imd > 2) color = "bg-blue-400";
  return { pct, color };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ImdPage() {
  const [rows, setRows]             = useState<Row[]>([]);
  const [summary, setSummary]       = useState<Summary | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [search, setSearch]         = useState("");
  const [imdFilter, setImdFilter]   = useState("todos");
  const [locais, setLocais]         = useState<LocalEstoque[]>([]);
  const [periodo, setPeriodo]       = useState<DateRange>(defaultRange());
  const [localId, setLocalId]       = useState("");
  const [periodMonths, setPeriodMonths] = useState(36);

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
      .then((d) => {
        setRows(d.rows ?? []);
        setSummary(d.summary ?? null);
        if (d.periodMonths) setPeriodMonths(d.periodMonths);
      })
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
    { key: "",    label: "Todos os locais", color: "bg-gray-100 text-gray-600" },
    ...locais.map((l) => ({ key: l.id, label: l.nome, color: "bg-blue-100 text-blue-700" })),
  ];

  const hasFilters = !!(search || imdFilter !== "todos" || localId);

  const filtered = useMemo(() => rows.filter((r) => {
    if (imdFilter !== "todos" && r.categoriaIMD !== imdFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!r.codigo.toLowerCase().includes(q) && !r.descricao.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [rows, imdFilter, search]);

  // Sort filtered: Estocável first, then MTO, then Obsoleto — within same category by IMD desc
  const sorted = useMemo(() => {
    const order = { ESTOCAVEL: 0, MTO: 1, OBSOLETO: 2 };
    return [...filtered].sort((a, b) => {
      const co = order[a.categoriaIMD] - order[b.categoriaIMD];
      if (co !== 0) return co;
      return b.imd - a.imd; // within same category: higher IMD first
    });
  }, [filtered]);

  // Count obsoletos com estoque imobilizado
  const obsoletosComEstoque = rows.filter((r) => r.categoriaIMD === "OBSOLETO" && r.estoqueAtual > 0).length;

  return (
    <div>
      <PageHeader
        title="IMD — Intervalo Médio entre Demandas"
        breadcrumbs={[{ label: "Almoxarifado" }, { label: "Relatórios" }, { label: "IMD" }]}
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

          <div className="w-px h-6 bg-gray-200 mx-1" />

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text" value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto..."
              className="pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-52"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <FilterDropdown label="Categoria" options={IMD_OPTIONS} value={imdFilter} onChange={setImdFilter} allKey="todos" placeholder="Categoria..." />
          {hasFilters && (
            <button onClick={() => { setSearch(""); setImdFilter("todos"); }} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
              <X className="w-3 h-3" /> Limpar
            </button>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
        )}

        {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
        {summary && (
          <div className="space-y-3">

            {/* Alert: obsoletos com estoque */}
            {obsoletosComEstoque > 0 && (
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-700">
                  <strong>{obsoletosComEstoque} {obsoletosComEstoque === 1 ? "item obsoleto" : "itens obsoletos"}</strong> com estoque imobilizado.
                  Avalie a possibilidade de devolução, descarte ou transferência.
                </p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              {(["ESTOCAVEL", "MTO", "OBSOLETO"] as const).map((cat) => {
                const s     = CAT_STYLES[cat];
                const count = summary[cat.toLowerCase() as "estocavel" | "mto" | "obsoleto"];
                const pct   = summary.totalItems > 0 ? Math.round((count / summary.totalItems) * 100) : 0;
                return (
                  <div key={cat} className={cn("rounded-xl border px-5 py-4", s.card)}>
                    <div className="flex items-center gap-3">
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", s.iconBg)}>
                        {s.icon}
                      </div>
                      <div className="min-w-0">
                        <p className={cn("text-xs font-semibold", s.title)}>{s.label}</p>
                        <p className={cn("text-3xl font-bold mt-0.5 leading-none", s.value)}>{count}</p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1">
                      <p className={cn("text-xs font-medium", s.sub)}>{s.range}</p>
                      <p className="text-xs text-gray-400">{pct}% do total de itens</p>
                      <p className="text-[11px] text-gray-400 leading-snug">{s.hint}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Distribution bar */}
            {summary.totalItems > 0 && (() => {
              const e = Math.round((summary.estocavel / summary.totalItems) * 100);
              const m = Math.round((summary.mto       / summary.totalItems) * 100);
              const o = Math.round((summary.obsoleto  / summary.totalItems) * 100);
              return (
                <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
                  <p className="text-xs font-semibold text-gray-500 mb-3">Distribuição dos Itens por Categoria IMD</p>
                  <div className="flex h-6 rounded-lg overflow-hidden gap-px">
                    {e > 0 && (
                      <div className="bg-emerald-400 flex items-center justify-center text-white text-[10px] font-bold" style={{ width: `${e}%` }}>
                        {e >= 8 ? `${e}%` : ""}
                      </div>
                    )}
                    {m > 0 && (
                      <div className="bg-blue-400 flex items-center justify-center text-white text-[10px] font-bold" style={{ width: `${m}%` }}>
                        {m >= 8 ? `${m}%` : ""}
                      </div>
                    )}
                    {o > 0 && (
                      <div className="bg-red-400 flex items-center justify-center text-white text-[10px] font-bold" style={{ width: `${o}%` }}>
                        {o >= 8 ? `${o}%` : ""}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-4 mt-2">
                    {(["ESTOCAVEL", "MTO", "OBSOLETO"] as const).map((cat) => {
                      const s = CAT_STYLES[cat];
                      const barColor = cat === "ESTOCAVEL" ? "bg-emerald-400" : cat === "MTO" ? "bg-blue-400" : "bg-red-400";
                      return (
                        <span key={cat} className="flex items-center gap-1.5 text-xs text-gray-500">
                          <span className={cn("w-3 h-3 rounded shrink-0", barColor)} />
                          {s.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}


        {/* ── Table ─────────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
            <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">{hasFilters ? "Nenhum item encontrado" : "Nenhum item cadastrado"}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Código</th>
                  <th className="text-left px-4 py-3 font-medium">Descrição</th>
                  <th className="text-left px-4 py-3 font-medium">Und.</th>
                  <th className="text-right px-4 py-3 font-medium">Meses c/ Consumo</th>
                  <th className="text-right px-4 py-3 font-medium">Meses s/ Consumo</th>
                  <th className="text-left px-4 py-3 font-medium w-40">IMD</th>
                  <th className="text-left px-4 py-3 font-medium">Categoria</th>
                  <th className="text-right px-4 py-3 font-medium">Estoque Atual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((row) => {
                  const s   = CAT_STYLES[row.categoriaIMD];
                  const bar = imdBar(row.imd);
                  const imdDisplay = row.imd >= 99 ? "∞" : row.imd.toFixed(1);
                  const obsoleteWithStock = row.categoriaIMD === "OBSOLETO" && row.estoqueAtual > 0;
                  return (
                    <tr
                      key={row.itemId}
                      className={cn(
                        "hover:bg-gray-50 transition-colors",
                        obsoleteWithStock && "bg-red-50/30"
                      )}
                    >
                      <td className="px-4 py-3">
                        <Link href={`/suprimentos/produtos/${row.itemId}`} className="font-mono text-xs text-blue-600 hover:underline">
                          {row.codigo}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-800 font-medium">
                        {row.descricao}
                        {row.tipoProduto && <span className="ml-2 text-xs text-gray-400 font-normal">{row.tipoProduto}</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs font-mono">{row.unidade}</td>

                      {/* Meses com consumo */}
                      <td className="px-4 py-3 text-right">
                        <span className={cn("text-sm tabular-nums font-semibold", row.mesesComConsumo > 0 ? "text-emerald-700" : "text-gray-300")}>
                          {row.mesesComConsumo}
                        </span>
                        <span className="text-xs text-gray-400 ml-1">/{periodMonths}</span>
                      </td>

                      {/* Meses sem consumo */}
                      <td className="px-4 py-3 text-right">
                        <span className={cn("text-sm tabular-nums font-semibold", row.mesesSemConsumo === 36 ? "text-red-600" : "text-gray-600")}>
                          {row.mesesSemConsumo}
                        </span>
                        <span className="text-xs text-gray-400 ml-1">/{periodMonths}</span>
                      </td>

                      {/* IMD com barra visual */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={cn("text-sm tabular-nums w-8 text-right shrink-0", s.imd)}>
                            {imdDisplay}
                          </span>
                          <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden min-w-[60px]">
                            <div
                              className={cn("h-2 rounded-full transition-all", bar.color)}
                              style={{ width: `${bar.pct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Categoria */}
                      <td className="px-4 py-3">
                        <div>
                          <ImdBadge cat={row.categoriaIMD} />
                          {obsoleteWithStock && (
                            <p className="text-[10px] text-red-500 mt-0.5 flex items-center gap-0.5">
                              <AlertTriangle className="w-3 h-3" />
                              {row.estoqueAtual.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {row.unidade} imobilizado
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Estoque */}
                      <td className="px-4 py-3 text-right">
                        <span className={cn("text-sm tabular-nums font-medium", row.estoqueAtual <= 0 ? "text-gray-300" : "text-gray-800")}>
                          {row.estoqueAtual > 0
                            ? row.estoqueAtual.toLocaleString("pt-BR", { maximumFractionDigits: 3 })
                            : "0"}
                          <span className="text-xs font-normal text-gray-400 ml-1">{row.unidade}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={8} className="px-4 py-2.5 text-xs font-medium text-gray-500">
                    {sorted.length} {sorted.length === 1 ? "item" : "itens"}
                    {hasFilters && rows.length !== sorted.length && ` (de ${rows.length})`}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* ── Metodologia ───────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-5 py-4">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
            <div className="space-y-3 text-xs text-gray-500 leading-relaxed">
              <p className="font-semibold text-gray-700">Metodologia — IMD (Intervalo Médio entre Demandas)</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <p className="font-medium text-gray-600 mb-1">Fórmula</p>
                  <p>
                    <strong>IMD = Meses com Consumo ÷ Meses sem Consumo</strong>{" "}
                    (período de análise: {periodMonths} meses).
                    Quanto maior o IMD, mais frequente é a demanda e mais o item
                    justifica manutenção em estoque.
                    Meses com consumo = meses com ao menos uma saída registrada.
                  </p>
                </div>
                <div>
                  <p className="font-medium text-gray-600 mb-1">Classificação</p>
                  <ul className="space-y-1">
                    <li><strong className="text-emerald-700">Estocável (IMD &gt; 5)</strong> — alta frequência; manter em estoque.</li>
                    <li><strong className="text-blue-700">MTO (IMD 2–5)</strong> — demanda irregular; comprar por necessidade.</li>
                    <li><strong className="text-red-600">Obsoleto (IMD &lt; 2)</strong> — baixíssima demanda; avaliar descarte ou devolução.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
