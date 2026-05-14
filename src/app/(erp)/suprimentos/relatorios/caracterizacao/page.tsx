"use client";

import { useState, useEffect, useMemo } from "react";
import PageHeader from "@/components/shared/PageHeader";
import FilterDropdown, { FilterOption } from "@/components/shared/FilterDropdown";
import { Search, X, Loader2, TrendingUp, TrendingDown, Package, AlertTriangle, Truck, Layers } from "lucide-react";
import Link from "next/link";
import { cn, formatBRL } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────
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
  mesesComConsumo: number;
  mesesSemConsumo: number;
  imd: number;
  categoriaIMD: "ESTOCAVEL" | "MTO" | "OBSOLETO";
};

type Summary = {
  totalItems: number;
  classA: { count: number; pctItems: number; pctValor: number };
  classB: { count: number; pctItems: number; pctValor: number };
  classC: { count: number; pctItems: number; pctValor: number };
  estocavel: number;
  mto: number;
  obsoleto: number;
  totalConsumoAnual: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────
const ABC_OPTIONS: FilterOption[] = [
  { key: "todos", label: "Todas",   color: "bg-gray-100 text-gray-600" },
  { key: "A",     label: "Classe A", color: "bg-rose-100 text-rose-700" },
  { key: "B",     label: "Classe B", color: "bg-amber-100 text-amber-700" },
  { key: "C",     label: "Classe C", color: "bg-gray-100 text-gray-600" },
];

const IMD_OPTIONS: FilterOption[] = [
  { key: "todos",     label: "Todas",      color: "bg-gray-100 text-gray-600" },
  { key: "ESTOCAVEL", label: "Estocável",  color: "bg-emerald-100 text-emerald-700" },
  { key: "MTO",       label: "MTO",        color: "bg-blue-100 text-blue-700" },
  { key: "OBSOLETO",  label: "Obsoleto",   color: "bg-red-100 text-red-700" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function AbcBadge({ cls }: { cls: "A" | "B" | "C" }) {
  const styles = {
    A: "bg-rose-100 text-rose-700 border-rose-200",
    B: "bg-amber-100 text-amber-700 border-amber-200",
    C: "bg-gray-100 text-gray-600 border-gray-200",
  };
  return (
    <span className={cn(
      "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold border",
      styles[cls]
    )}>
      {cls}
    </span>
  );
}

function ImdBadge({ cat }: { cat: "ESTOCAVEL" | "MTO" | "OBSOLETO" }) {
  const map = {
    ESTOCAVEL: { label: "Estocável", cls: "bg-emerald-100 text-emerald-700", icon: <Package className="w-3 h-3" /> },
    MTO:       { label: "MTO",       cls: "bg-blue-100 text-blue-700",       icon: <Truck className="w-3 h-3" /> },
    OBSOLETO:  { label: "Obsoleto",  cls: "bg-red-100 text-red-700",         icon: <AlertTriangle className="w-3 h-3" /> },
  };
  const m = map[cat];
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", m.cls)}>
      {m.icon}{m.label}
    </span>
  );
}

function imdColor(imd: number) {
  if (imd > 5)  return "text-emerald-700 font-semibold";
  if (imd > 2)  return "text-blue-700 font-semibold";
  return "text-red-600 font-semibold";
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function CaracterizacaoPage() {
  const [rows, setRows]         = useState<Row[]>([]);
  const [summary, setSummary]   = useState<Summary | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [search, setSearch]     = useState("");
  const [abcFilter, setAbcFilter] = useState("todos");
  const [imdFilter, setImdFilter] = useState("todos");

  useEffect(() => {
    setLoading(true);
    fetch("/api/suprimentos/relatorios/caracterizacao")
      .then((r) => r.json())
      .then((d) => { setRows(d.rows ?? []); setSummary(d.summary ?? null); })
      .catch(() => setError("Erro ao carregar dados"))
      .finally(() => setLoading(false));
  }, []);

  const hasFilters = search || abcFilter !== "todos" || imdFilter !== "todos";

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (abcFilter !== "todos" && r.curvaABC !== abcFilter) return false;
      if (imdFilter !== "todos" && r.categoriaIMD !== imdFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!r.codigo.toLowerCase().includes(q) && !r.descricao.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, abcFilter, imdFilter, search]);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="Caracterização de Produtos"
        breadcrumbs={[{ label: "Almoxarifado" }, { label: "Relatórios" }, { label: "Caracterização" }]}
      />

      <div className="px-8 pb-8 space-y-6">

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
        )}

        {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
        {summary && (
          <div className="space-y-4">
            {/* ABC row */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Curva ABC — por Valor de Consumo Anual</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Total */}
                <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
                  <p className="text-xs text-gray-500 font-medium">Total de Itens</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{summary.totalItems}</p>
                  <p className="text-xs text-gray-400 mt-1">analisados</p>
                </div>
                {/* Classe A */}
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-rose-600 font-semibold">Classe A</p>
                    <AbcBadge cls="A" />
                  </div>
                  <p className="text-3xl font-bold text-rose-800 mt-1">{summary.classA.count}</p>
                  <p className="text-xs text-rose-500 mt-1">
                    {summary.classA.pctItems}% dos itens · ~{summary.classA.pctValor}% do valor
                  </p>
                  <p className="text-xs text-rose-400 mt-0.5">{formatBRL(summary.totalConsumoAnual * (summary.classA.pctValor / 100))} / ano</p>
                </div>
                {/* Classe B */}
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-amber-600 font-semibold">Classe B</p>
                    <AbcBadge cls="B" />
                  </div>
                  <p className="text-3xl font-bold text-amber-800 mt-1">{summary.classB.count}</p>
                  <p className="text-xs text-amber-500 mt-1">
                    {summary.classB.pctItems}% dos itens · ~{summary.classB.pctValor}% do valor
                  </p>
                  <p className="text-xs text-amber-400 mt-0.5">{formatBRL(summary.totalConsumoAnual * (summary.classB.pctValor / 100))} / ano</p>
                </div>
                {/* Classe C */}
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500 font-semibold">Classe C</p>
                    <AbcBadge cls="C" />
                  </div>
                  <p className="text-3xl font-bold text-gray-700 mt-1">{summary.classC.count}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {summary.classC.pctItems}% dos itens · ~{summary.classC.pctValor}% do valor
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatBRL(summary.totalConsumoAnual * (summary.classC.pctValor / 100))} / ano</p>
                </div>
              </div>
            </div>

            {/* IMD row */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Categorização IMD — Intervalo Médio entre Demandas (36 meses)</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600 font-semibold">Estocáveis</p>
                    <p className="text-3xl font-bold text-emerald-800">{summary.estocavel}</p>
                    <p className="text-xs text-emerald-500 mt-0.5">IMD &gt; 5</p>
                  </div>
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                    <Truck className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-blue-600 font-semibold">MTO — Make to Order</p>
                    <p className="text-3xl font-bold text-blue-800">{summary.mto}</p>
                    <p className="text-xs text-blue-500 mt-0.5">IMD entre 2 e 5</p>
                  </div>
                </div>
                <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-xs text-red-600 font-semibold">Obsoletos</p>
                    <p className="text-3xl font-bold text-red-800">{summary.obsoleto}</p>
                    <p className="text-xs text-red-500 mt-0.5">IMD &lt; 2</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ABC bar chart visual */}
            {summary.totalItems > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
                <p className="text-xs font-medium text-gray-500 mb-3">Distribuição do Valor de Consumo Anual</p>
                <div className="flex h-6 rounded-full overflow-hidden gap-0.5">
                  {summary.classA.pctValor > 0 && (
                    <div
                      className="bg-rose-400 flex items-center justify-center text-white text-[10px] font-bold transition-all"
                      style={{ width: `${summary.classA.pctValor}%` }}
                    >
                      {summary.classA.pctValor >= 8 ? `A ${summary.classA.pctValor}%` : ""}
                    </div>
                  )}
                  {summary.classB.pctValor > 0 && (
                    <div
                      className="bg-amber-400 flex items-center justify-center text-white text-[10px] font-bold transition-all"
                      style={{ width: `${summary.classB.pctValor}%` }}
                    >
                      {summary.classB.pctValor >= 6 ? `B ${summary.classB.pctValor}%` : ""}
                    </div>
                  )}
                  {summary.classC.pctValor > 0 && (
                    <div
                      className="bg-gray-300 flex items-center justify-center text-gray-600 text-[10px] font-bold transition-all"
                      style={{ width: `${summary.classC.pctValor}%` }}
                    >
                      {summary.classC.pctValor >= 6 ? `C ${summary.classC.pctValor}%` : ""}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-2">
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="w-3 h-3 rounded bg-rose-400 shrink-0" /> A — Alta criticidade
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="w-3 h-3 rounded bg-amber-400 shrink-0" /> B — Média criticidade
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="w-3 h-3 rounded bg-gray-300 shrink-0" /> C — Baixa criticidade
                  </span>
                  <span className="ml-auto text-xs text-gray-400 font-medium">
                    Total anual: {formatBRL(summary.totalConsumoAnual)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Filters ───────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text" value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por código ou descrição..."
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <FilterDropdown
            label="Curva ABC"
            options={ABC_OPTIONS}
            value={abcFilter}
            onChange={setAbcFilter}
            allKey="todos"
            placeholder="Curva ABC..."
          />
          <FilterDropdown
            label="Categoria IMD"
            options={IMD_OPTIONS}
            value={imdFilter}
            onChange={setImdFilter}
            allKey="todos"
            placeholder="Categoria..."
          />
          {hasFilters && (
            <button
              onClick={() => { setSearch(""); setAbcFilter("todos"); setImdFilter("todos"); }}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
            >
              <X className="w-3 h-3" /> Limpar
            </button>
          )}
        </div>

        {/* ── Table ─────────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
            <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">
              {hasFilters ? "Nenhum item encontrado com os filtros aplicados" : "Nenhum item cadastrado"}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Código</th>
                  <th className="text-left px-4 py-3 font-medium">Descrição</th>
                  <th className="text-left px-4 py-3 font-medium">Und.</th>
                  <th className="text-center px-4 py-3 font-medium">ABC</th>
                  <th className="text-right px-4 py-3 font-medium">% Acum.</th>
                  <th className="text-right px-4 py-3 font-medium">Consumo Anual</th>
                  <th className="text-right px-4 py-3 font-medium">Meses c/ Consumo</th>
                  <th className="text-right px-4 py-3 font-medium">IMD</th>
                  <th className="text-left px-4 py-3 font-medium">Categoria</th>
                  <th className="text-right px-4 py-3 font-medium">Estoque Atual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((row, idx) => (
                  <tr key={row.itemId} className={cn(
                    "hover:bg-gray-50 transition-colors",
                    row.categoriaIMD === "OBSOLETO" && row.estoqueAtual > 0 && "bg-red-50/30",
                  )}>
                    {/* Ranking */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-300 w-5 text-right shrink-0">{idx + 1}</span>
                        <Link
                          href={`/suprimentos/produtos/${row.itemId}`}
                          className="font-mono text-xs text-blue-600 hover:underline"
                        >
                          {row.codigo}
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-800">
                      <div>
                        <span className="font-medium">{row.descricao}</span>
                        {row.tipoProduto && (
                          <span className="ml-2 text-xs text-gray-400">{row.tipoProduto}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">{row.unidade}</td>
                    <td className="px-4 py-3 text-center">
                      <AbcBadge cls={row.curvaABC} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 bg-gray-100 rounded-full h-1.5 hidden sm:block">
                          <div
                            className={cn(
                              "h-1.5 rounded-full",
                              row.curvaABC === "A" ? "bg-rose-400" :
                              row.curvaABC === "B" ? "bg-amber-400" : "bg-gray-300"
                            )}
                            style={{ width: `${Math.min(row.pctAcumulado, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 tabular-nums">{row.pctAcumulado.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn(
                        "text-sm tabular-nums",
                        row.valorConsumoAnual > 0 ? "text-gray-800 font-medium" : "text-gray-300"
                      )}>
                        {row.valorConsumoAnual > 0 ? formatBRL(row.valorConsumoAnual) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm tabular-nums text-gray-600">
                        {row.mesesComConsumo}
                        <span className="text-xs text-gray-400">/36</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn("text-sm tabular-nums", imdColor(row.imd))}>
                        {row.imd >= 99 ? "∞" : row.imd.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ImdBadge cat={row.categoriaIMD} />
                      {row.categoriaIMD === "OBSOLETO" && row.estoqueAtual > 0 && (
                        <p className="text-[10px] text-red-500 mt-0.5">há estoque imobilizado</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn(
                        "text-sm tabular-nums font-medium",
                        row.estoqueAtual <= 0 ? "text-gray-300" : "text-gray-800"
                      )}>
                        {row.estoqueAtual > 0
                          ? row.estoqueAtual.toLocaleString("pt-BR", { maximumFractionDigits: 3 })
                          : "0"}
                        <span className="text-xs font-normal text-gray-400 ml-1">{row.unidade}</span>
      </span>
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Footer totals */}
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={5} className="px-4 py-2.5 text-xs font-medium text-gray-500">
                      {filtered.length} {filtered.length === 1 ? "item" : "itens"}
                      {hasFilters && rows.length !== filtered.length && ` (de ${rows.length})`}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold text-gray-800 tabular-nums">
                      {formatBRL(filtered.reduce((s, r) => s + r.valorConsumoAnual, 0))}
                      <span className="text-xs font-normal text-gray-400 ml-1">/ano</span>
                    </td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* ── Metodologia ───────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-5 py-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Metodologia</p>
          <div className="grid sm:grid-cols-2 gap-4 text-xs text-gray-500 leading-relaxed">
            <div>
              <p className="font-semibold text-gray-700 mb-1">Curva ABC (Princípio de Pareto)</p>
              <p>
                Hierarquiza os itens pelo <strong>Valor de Consumo Anual</strong> (saídas × custo, anualizado dos últimos 36 meses).
                Classe <strong>A</strong> acumula ~80% do valor (alta criticidade),
                <strong> B</strong> de 80–95% (média) e <strong>C</strong> os restantes 5% (baixa).
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">IMD — Intervalo Médio entre Demandas</p>
              <p>
                <strong>IMD = 36 ÷ Meses sem Consumo</strong> (últimos 36 meses).
                IMD &gt; 5 → <strong className="text-emerald-700">Estocável</strong> (alta frequência de consumo);
                2 a 5 → <strong className="text-blue-700">MTO</strong> (comprar sob demanda);
                &lt; 2 → <strong className="text-red-600">Obsoleto</strong> (baixíssima demanda).
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
