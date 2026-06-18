"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import PageHeader from "@/components/shared/PageHeader";
import DateRangePicker, { DateRange } from "@/components/shared/DateRangePicker";
import { useTabTitle } from "@/lib/tabs-context";
import { formatBRL, cn } from "@/lib/utils";
import { Package, Loader2, Search, Download, ArrowDownToLine, ArrowUpFromLine, TrendingUp, Shuffle } from "lucide-react";

type Row = {
  itemId: string;
  codigo: string;
  descricao: string;
  unidade: string;
  entrouQtd: number;
  saiuQtd: number;
  vendaOrdemQtd: number;
  qtdVendida: number;
  valorVendido: number;
  precoMedioPeriodo: number;
  precoMedioGeral: number;
};

type SortKey = "descricao" | "entrouQtd" | "saiuQtd" | "vendaOrdemQtd" | "qtdVendida" | "precoMedioPeriodo" | "precoMedioGeral" | "valorVendido";

function fmtNum(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function defaultRange(): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function MateriaisReportPage() {
  useTabTitle("Materiais Vendidos");

  const [range, setRange] = useState<DateRange>(defaultRange);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "valorVendido", dir: "desc" });

  const rangeRef = useRef(range);
  useEffect(() => { rangeRef.current = range; }, [range]);

  const load = useCallback(async () => {
    const { from, to } = rangeRef.current;
    if (!from || !to) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/comercial/relatorios/materiais?from=${from}&to=${to}`);
      const json = await res.json();
      setRows(Array.isArray(json.rows) ? json.rows : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!range.from || !range.to) return;
    load();
  }, [range.from, range.to, load]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const base = termo
      ? rows.filter((r) => r.descricao.toLowerCase().includes(termo) || r.codigo.toLowerCase().includes(termo))
      : rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      if (sort.key === "descricao") return a.descricao.localeCompare(b.descricao, "pt-BR") * dir;
      return ((a[sort.key] as number) - (b[sort.key] as number)) * dir;
    });
  }, [rows, busca, sort]);

  const kpis = useMemo(() => {
    const totalEntrou = rows.reduce((s, r) => s + r.entrouQtd, 0);
    const totalSaiu = rows.reduce((s, r) => s + r.saiuQtd, 0);
    const totalVendido = rows.reduce((s, r) => s + r.valorVendido, 0);
    const totalVendaOrdem = rows.reduce((s, r) => s + r.vendaOrdemQtd, 0);
    const comVenda = rows.filter((r) => r.qtdVendida > 0).length;
    return { totalEntrou, totalSaiu, totalVendido, totalVendaOrdem, comVenda };
  }, [rows]);

  function toggleSort(key: SortKey) {
    setSort((prev) => prev.key === key
      ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { key, dir: key === "descricao" ? "asc" : "desc" });
  }

  function exportCsv() {
    const header = ["Código", "Material", "Un", "Entrou", "Saiu", "Venda à Ordem", "Qtd Vendida", "Preço Médio (período)", "Preço Médio (geral)", "Total Vendido"];
    const linhas = filtradas.map((r) => [
      r.codigo, r.descricao, r.unidade,
      fmtNum(r.entrouQtd), fmtNum(r.saiuQtd), fmtNum(r.vendaOrdemQtd), fmtNum(r.qtdVendida),
      r.precoMedioPeriodo.toFixed(2), r.precoMedioGeral.toFixed(2), r.valorVendido.toFixed(2),
    ]);
    const csv = [header, ...linhas]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `materiais_${range.from}_a_${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Materiais Vendidos"
        breadcrumbs={[{ label: "Comercial" }, { label: "Relatórios" }, { label: "Materiais Vendidos" }]}
      />

      <div className="px-8 pb-8 space-y-6">
        {/* Filtros */}
        <div className="flex items-center gap-3 flex-wrap">
          <DateRangePicker value={range} onChange={setRange} />
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar material por nome ou código..."
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={filtradas.length === 0}
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard icon={<ArrowDownToLine className="w-4 h-4" />} label="Total que entrou" value={fmtNum(kpis.totalEntrou)} />
          <KpiCard icon={<ArrowUpFromLine className="w-4 h-4" />} label="Total que saiu" value={fmtNum(kpis.totalSaiu)} />
          <KpiCard icon={<Shuffle className="w-4 h-4" />} label="Venda à ordem" value={fmtNum(kpis.totalVendaOrdem)} />
          <KpiCard icon={<TrendingUp className="w-4 h-4" />} label="Total vendido" value={formatBRL(kpis.totalVendido)} />
          <KpiCard icon={<Package className="w-4 h-4" />} label="Materiais com venda" value={String(kpis.comVenda)} />
        </div>

        {/* Tabela */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Package className="w-4 h-4 text-muted-foreground" /> Materiais
            </p>
            <span className="text-xs text-muted-foreground">
              {filtradas.length} material{filtradas.length !== 1 ? "is" : ""} · preço médio = valor vendido ÷ quantidade vendida
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-sm">Carregando…</span>
            </div>
          ) : filtradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <Package className="w-8 h-8 text-muted-foreground/60" />
              <p className="text-sm font-medium">Nenhuma movimentação ou venda no período</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                  <tr>
                    <Th label="Material" sortKey="descricao" sort={sort} onSort={toggleSort} align="left" />
                    <th className="text-left px-4 py-3 font-semibold">Un</th>
                    <Th label="Entrou" sortKey="entrouQtd" sort={sort} onSort={toggleSort} align="right" />
                    <Th label="Saiu" sortKey="saiuQtd" sort={sort} onSort={toggleSort} align="right" />
                    <Th label="V. à Ordem" sortKey="vendaOrdemQtd" sort={sort} onSort={toggleSort} align="right" />
                    <Th label="Qtd Vendida" sortKey="qtdVendida" sort={sort} onSort={toggleSort} align="right" />
                    <Th label="Preço Médio (período)" sortKey="precoMedioPeriodo" sort={sort} onSort={toggleSort} align="right" />
                    <Th label="Preço Médio (geral)" sortKey="precoMedioGeral" sort={sort} onSort={toggleSort} align="right" />
                    <Th label="Total Vendido" sortKey="valorVendido" sort={sort} onSort={toggleSort} align="right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtradas.map((r) => (
                    <tr key={r.itemId} className="hover:bg-muted transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs text-info">{r.codigo}</div>
                        <div className="text-foreground max-w-[260px] truncate" title={r.descricao}>{r.descricao}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.unidade}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-success">{r.entrouQtd ? fmtNum(r.entrouQtd) : <span className="text-muted-foreground/60">—</span>}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-danger">{r.saiuQtd ? fmtNum(r.saiuQtd) : <span className="text-muted-foreground/60">—</span>}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-violet-700 dark:text-violet-300">{r.vendaOrdemQtd ? fmtNum(r.vendaOrdemQtd) : <span className="text-muted-foreground/60">—</span>}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">{r.qtdVendida ? fmtNum(r.qtdVendida) : <span className="text-muted-foreground/60">—</span>}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">{r.precoMedioPeriodo ? formatBRL(r.precoMedioPeriodo) : <span className="text-muted-foreground/60">—</span>}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{r.precoMedioGeral ? formatBRL(r.precoMedioGeral) : <span className="text-muted-foreground/60">—</span>}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground">{r.valorVendido ? formatBRL(r.valorVendido) : <span className="text-muted-foreground/60">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-border bg-muted">
                  <tr className="font-semibold text-foreground">
                    <td className="px-4 py-3" colSpan={2}>Total ({filtradas.length})</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtNum(filtradas.reduce((s, r) => s + r.entrouQtd, 0))}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtNum(filtradas.reduce((s, r) => s + r.saiuQtd, 0))}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-violet-700 dark:text-violet-300">{fmtNum(filtradas.reduce((s, r) => s + r.vendaOrdemQtd, 0))}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtNum(filtradas.reduce((s, r) => s + r.qtdVendida, 0))}</td>
                    <td className="px-4 py-3" colSpan={2} />
                    <td className="px-4 py-3 text-right tabular-nums">{formatBRL(filtradas.reduce((s, r) => s + r.valorVendido, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Th({ label, sortKey, sort, onSort, align }: {
  label: string; sortKey: SortKey; sort: { key: SortKey; dir: "asc" | "desc" }; onSort: (k: SortKey) => void; align: "left" | "right";
}) {
  const active = sort.key === sortKey;
  return (
    <th className={cn("px-4 py-3 font-semibold select-none", align === "right" ? "text-right" : "text-left")}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn("inline-flex items-center gap-1 hover:text-foreground transition-colors", align === "right" && "flex-row-reverse", active && "text-info")}
      >
        {label}
        {active && <span className="text-[10px]">{sort.dir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {icon}{label}
      </div>
      <div className="mt-1.5 text-xl font-bold text-foreground tabular-nums">{value}</div>
    </div>
  );
}
