"use client";

import { useState, useEffect, useCallback } from "react";
import { usePersistedFilters } from "@/lib/use-persisted-filters";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import {
  TrendingUp, TrendingDown, BarChart3, Download,
  Loader2, Search, FileBarChart2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import DateRangePicker, { DateRange } from "@/components/shared/DateRangePicker";
import FilterDropdown, { FilterOption } from "@/components/shared/FilterDropdown";

// ── Types ──────────────────────────────────────────────────────────────────────
type LocalEstoque = { id: string; nome: string };

type Row = {
  itemId: string;
  codigo: string;
  descricao: string;
  unidade: string;
  totalEntradaQtd: number;
  totalEntradaValor: number;
  totalSaidaQtd: number;
  totalSaidaValor: number;
  movimentacoes: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatQty(v: number) {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

// Default date range: first day of current month → today
function defaultRange(): DateRange {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${day}` };
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function RelatorioMovimentacoesPage() {
  const [locais, setLocais]     = useState<LocalEstoque[]>([]);
  const [rows, setRows]         = useState<Row[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const [searched, setSearched] = useState(false);

  // Filters — persisted per user
  const [f, setF] = usePersistedFilters("relatorio-movimentacoes", {
    periodo: defaultRange() as DateRange,
    localId: "",
    tipo:    "",   // "" | "ENTRADA" | "SAIDA"
    search:  "",   // client-side name filter
  });
  const { periodo, localId, tipo, search } = f;
  const setPeriodo = (v: DateRange) => setF({ periodo: v });
  const setLocalId = (v: string)    => setF({ localId: v });
  const setTipo    = (v: string)    => setF({ tipo: v });
  const setSearch  = (v: string)    => setF({ search: v });

  // Load locais once
  useEffect(() => {
    fetch("/api/suprimentos/locais-estoque")
      .then((r) => r.json())
      .then((d) => setLocais(Array.isArray(d) ? d : []));
  }, []);

  // ── Fetch report ─────────────────────────────────────────────────────────────
  const fetchReport = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (periodo.from) params.set("dataInicio", periodo.from);
    if (periodo.to)   params.set("dataFim",    periodo.to);
    if (localId)      params.set("localId",    localId);
    if (tipo)         params.set("tipo",       tipo);

    const res  = await fetch(`/api/suprimentos/relatorios/movimentacoes?${params}`);
    const data = await res.json();
    setRows(Array.isArray(data.rows) ? data.rows : []);
    setTotal(data.total ?? 0);
    setLoading(false);
    setSearched(true);
  }, [periodo, localId, tipo]);

  // Auto-fetch on mount
  useEffect(() => { fetchReport(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ───────────────────────────────────────────────────────────────────
  const filtered = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.descricao.toLowerCase().includes(q) || r.codigo.toLowerCase().includes(q);
  });

  const totEntradaQtd   = filtered.reduce((s, r) => s + r.totalEntradaQtd,   0);
  const totEntradaValor = filtered.reduce((s, r) => s + r.totalEntradaValor, 0);
  const totSaidaQtd     = filtered.reduce((s, r) => s + r.totalSaidaQtd,     0);
  const totSaidaValor   = filtered.reduce((s, r) => s + r.totalSaidaValor,   0);
  const saldoLiquido    = totEntradaValor - totSaidaValor;

  // ── CSV export ────────────────────────────────────────────────────────────────
  function exportCSV() {
    const header = ["Código", "Produto", "Unidade", "Qtd. Entrada", "Valor Entrada (R$)", "Qtd. Saída", "Valor Saída (R$)", "Saldo (R$)"];
    const body = filtered.map((r) => [
      r.codigo,
      `"${r.descricao.replace(/"/g, '""')}"`,
      r.unidade,
      r.totalEntradaQtd.toFixed(3),
      r.totalEntradaValor.toFixed(2),
      r.totalSaidaQtd.toFixed(3),
      r.totalSaidaValor.toFixed(2),
      (r.totalEntradaValor - r.totalSaidaValor).toFixed(2),
    ].join(";"));
    const csv = [header.join(";"), ...body].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `consumo-materiais-${periodo.from || "inicio"}-${periodo.to || "fim"}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="Entradas e Saídas"
        breadcrumbs={[{ label: "Almoxarifado" }, { label: "Relatórios" }, { label: "Entradas e Saídas" }]}
      />

      <div className="px-8 pb-8 space-y-5">

        {/* ── Filter bar ─────────────────────────────────────────────────── */}
        {(() => {
          const TIPO_OPTIONS: FilterOption[] = [
            { key: "ENTRADA", label: "Entradas", color: "bg-emerald-100 text-emerald-700" },
            { key: "SAIDA",   label: "Saídas",   color: "bg-red-100 text-red-700" },
          ];
          const LOCAL_OPTIONS: FilterOption[] = locais.map((l) => ({ key: l.id, label: l.nome }));
          const defaultR = defaultRange();
          const isDefaultRange = periodo.from === defaultR.from && periodo.to === defaultR.to;
          const hasFilters = tipo !== "todos" || localId !== "todos" || !isDefaultRange;

          return (
            <div className="flex flex-wrap items-center gap-2">
              <DateRangePicker
                value={periodo}
                onChange={setPeriodo}
                placeholder="Período..."
              />
              <FilterDropdown
                label="Tipo"
                options={TIPO_OPTIONS}
                value={tipo === "" ? "todos" : tipo}
                onChange={(v) => setTipo(v === "todos" ? "" : v)}
                allKey="todos"
                placeholder="Buscar tipo..."
              />
              <FilterDropdown
                label="Local"
                options={LOCAL_OPTIONS}
                value={localId === "" ? "todos" : localId}
                onChange={(v) => setLocalId(v === "todos" ? "" : v)}
                allKey="todos"
                placeholder="Buscar local..."
              />
              {hasFilters && (
                <button
                  onClick={() => { setTipo(""); setLocalId(""); setPeriodo(defaultRange()); }}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" /> Limpar
                </button>
              )}
              {/* Product search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filtrar por produto..."
                  className="pl-8 pr-3 h-9 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
                />
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <Button onClick={fetchReport} disabled={loading} size="sm">
                  {loading && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
                  Gerar Relatório
                </Button>
                {rows.length > 0 && (
                  <Button variant="outline" size="sm" onClick={exportCSV}>
                    <Download className="w-4 h-4 mr-1.5" />
                    Exportar CSV
                  </Button>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── KPI cards ──────────────────────────────────────────────────── */}
        {searched && !loading && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Total Entradas</p>
                <p className="text-xl font-bold text-emerald-700">{formatBRL(totEntradaValor)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{formatQty(totEntradaQtd)} unidades</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                <TrendingDown className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Total Saídas</p>
                <p className="text-xl font-bold text-red-600">{formatBRL(totSaidaValor)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{formatQty(totSaidaQtd)} unidades</p>
              </div>
            </div>

            <div className={cn(
              "bg-white rounded-xl border px-5 py-4 flex items-center gap-4",
              saldoLiquido >= 0 ? "border-gray-200" : "border-orange-200 bg-orange-50/30"
            )}>
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                saldoLiquido >= 0 ? "bg-blue-50" : "bg-orange-50"
              )}>
                <BarChart3 className={cn("w-5 h-5", saldoLiquido >= 0 ? "text-blue-600" : "text-orange-500")} />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Saldo Líquido</p>
                <p className={cn("text-xl font-bold", saldoLiquido >= 0 ? "text-blue-700" : "text-orange-600")}>
                  {formatBRL(saldoLiquido)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{filtered.length} produto{filtered.length !== 1 ? "s" : ""} · {total} mov.</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Table ──────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 flex justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin text-gray-300" />
          </div>
        ) : !searched ? null : rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
            <FileBarChart2 className="w-12 h-12 opacity-20" />
            <p className="font-medium">Nenhuma movimentação no período</p>
            <p className="text-sm">Ajuste os filtros e gere o relatório novamente.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-xs text-gray-400 uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">Código</th>
                    <th className="text-left px-4 py-3 font-medium">Produto</th>
                    <th className="text-left px-4 py-3 font-medium">Und.</th>
                    {/* Entradas */}
                    <th className="text-right px-4 py-3 font-medium border-l border-gray-200 text-emerald-600">
                      Qtd. Entrada
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-emerald-600">
                      Valor Entrada
                    </th>
                    {/* Saídas */}
                    <th className="text-right px-4 py-3 font-medium border-l border-gray-200 text-red-500">
                      Qtd. Saída
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-red-500">
                      Valor Saída
                    </th>
                    {/* Saldo */}
                    <th className="text-right px-4 py-3 font-medium border-l border-gray-200 text-blue-600">
                      Saldo (R$)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((r) => {
                    const saldo = r.totalEntradaValor - r.totalSaidaValor;
                    return (
                      <tr key={r.itemId} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                          {r.codigo}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900 max-w-[260px]">
                          <span className="truncate block">{r.descricao}</span>
                          <span className="text-xs text-gray-400">{r.movimentacoes} mov.</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                          {r.unidade}
                        </td>
                        {/* Entradas */}
                        <td className="px-4 py-3 text-right border-l border-gray-100">
                          {r.totalEntradaQtd > 0 ? (
                            <span className="text-emerald-700 font-medium">
                              +{formatQty(r.totalEntradaQtd)}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {r.totalEntradaValor > 0 ? (
                            <span className="text-emerald-700 font-semibold">
                              {formatBRL(r.totalEntradaValor)}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        {/* Saídas */}
                        <td className="px-4 py-3 text-right border-l border-gray-100">
                          {r.totalSaidaQtd > 0 ? (
                            <span className="text-red-600 font-medium">
                              -{formatQty(r.totalSaidaQtd)}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {r.totalSaidaValor > 0 ? (
                            <span className="text-red-600 font-semibold">
                              {formatBRL(r.totalSaidaValor)}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        {/* Saldo */}
                        <td className="px-4 py-3 text-right border-l border-gray-100">
                          <span className={cn(
                            "font-bold",
                            saldo > 0 ? "text-blue-700" : saldo < 0 ? "text-orange-600" : "text-gray-400"
                          )}>
                            {formatBRL(saldo)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* Totals footer */}
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-sm">
                    <td colSpan={3} className="px-4 py-3 text-gray-500 text-xs uppercase tracking-wide">
                      Total ({filtered.length} produto{filtered.length !== 1 ? "s" : ""})
                    </td>
                    <td className="px-4 py-3 border-l border-gray-200" />
                    <td className="px-4 py-3 text-right text-emerald-700">
                      {formatBRL(totEntradaValor)}
                    </td>
                    <td className="px-4 py-3 border-l border-gray-200" />
                    <td className="px-4 py-3 text-right text-red-600">
                      {formatBRL(totSaidaValor)}
                    </td>
                    <td className={cn(
                      "px-4 py-3 text-right border-l border-gray-200",
                      saldoLiquido >= 0 ? "text-blue-700" : "text-orange-600"
                    )}>
                      {formatBRL(saldoLiquido)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
