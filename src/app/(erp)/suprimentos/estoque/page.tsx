"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import FilterDropdown, { FilterOption } from "@/components/shared/FilterDropdown";
import { Search, X, Loader2, Package, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useColumnOrder } from "@/lib/use-column-order";
import { useColumnVisibility } from "@/lib/use-column-visibility";
import ColumnConfigurator, { ColDef } from "@/components/shared/ColumnConfigurator";

// ── Types ─────────────────────────────────────────────────────────────────────
type EstoqueItem = {
  id: string;
  quantidadeAtual: unknown;
  quantidadeMin: unknown;
  quantidadeMax: unknown | null;
  item: {
    id: string;
    codigo: string;
    descricao: string;
    ativo: boolean;
    unidadeMedida: string;
    unidade: { sigla: string } | null;
  };
  localEstoque: { id: string; nome: string } | null;
  clienteDono?: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
};

// Consolidated row: one per product, totals summed across locations
type ProdutoRow = {
  itemId: string;
  codigo: string;
  descricao: string;
  ativo: boolean;
  unidade: string;
  qtdTotal: number;
  qtdTerceiros: number; // parcela do total que pertence a clientes (sob guarda)
  minTotal: number;
  maxTotal: number | null;
  locaisCount: number; // how many locations this product is in
};

type LocalEstoque = { id: string; nome: string };

function toNum(v: unknown) { return parseFloat(String(v ?? 0)); }

type SituacaoFilter = "todos" | "baixo" | "normal" | "acima";

// ── Column definitions ────────────────────────────────────────────────────────
const COLS: ColDef<ProdutoRow>[] = [
  {
    id: "codigo",
    label: "Código",
    thClass: "text-left px-4 py-3 font-semibold",
    tdClass: "px-4 py-3.5",
    render: (p) => (
      <Link href={`/suprimentos/produtos/${p.itemId}`} className="font-mono text-xs font-semibold text-blue-600 hover:underline">
        {p.codigo}
      </Link>
    ),
  },
  {
    id: "descricao",
    label: "Descrição",
    thClass: "text-left px-4 py-3 font-semibold",
    tdClass: "px-4 py-3.5 font-semibold text-gray-900",
    render: (p) => p.descricao,
  },
  {
    id: "qtdTotal",
    label: "Qtd. Total",
    thClass: "text-right px-4 py-3 font-semibold",
    tdClass: "px-4 py-3.5 text-right",
    render: (p) => {
      const propria = p.qtdTotal - p.qtdTerceiros;
      const abaixo = p.minTotal > 0 && propria < p.minTotal;
      return (
        <>
          <span className={cn("font-bold text-base", abaixo ? "text-red-600" : "text-gray-900")}>
            {p.qtdTotal.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
          </span>
          <span className="text-xs text-gray-600 ml-1 font-semibold">{p.unidade}</span>
          {p.qtdTerceiros > 0 && (
            <div className="text-[11px] text-amber-700 font-medium">
              dos quais {p.qtdTerceiros.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} de terceiros
            </div>
          )}
        </>
      );
    },
  },
  {
    id: "minimo",
    label: "Mínimo",
    thClass: "text-right px-4 py-3 font-semibold",
    tdClass: "px-4 py-3.5 text-right text-gray-700 text-sm font-semibold",
    render: (p) => p.minTotal > 0 ? p.minTotal.toLocaleString("pt-BR") : <span className="text-gray-400">—</span>,
  },
  {
    id: "maximo",
    label: "Máximo",
    thClass: "text-right px-4 py-3 font-semibold",
    tdClass: "px-4 py-3.5 text-right text-gray-700 text-sm font-semibold",
    render: (p) => p.maxTotal !== null ? p.maxTotal.toLocaleString("pt-BR") : <span className="text-gray-400">—</span>,
  },
  {
    id: "situacao",
    label: "Situação",
    thClass: "text-center px-4 py-3 font-semibold",
    tdClass: "px-4 py-3.5 text-center",
    render: (p) => {
      const propria = p.qtdTotal - p.qtdTerceiros;
      const abaixo = p.minTotal > 0 && propria < p.minTotal;
      const acima  = p.maxTotal !== null && propria > p.maxTotal;
      if (abaixo) return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 border border-red-200 px-2.5 py-1 rounded-full">
          <AlertTriangle className="w-3 h-3" /> Baixo
        </span>
      );
      if (acima) return (
        <span className="text-xs font-semibold text-amber-700 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-full">Acima máx.</span>
      );
      return (
        <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-full">Normal</span>
      );
    },
  },
];

const SITUACAO_OPTIONS: FilterOption[] = [
  { key: "todos",  label: "Todas",      color: "bg-gray-100 text-gray-600" },
  { key: "baixo",  label: "Abaixo min", color: "bg-red-100 text-red-700" },
  { key: "normal", label: "Normal",     color: "bg-emerald-100 text-emerald-700" },
  { key: "acima",  label: "Acima máx",  color: "bg-amber-100 text-amber-700" },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function EstoquePage() {
  const [items, setItems]   = useState<EstoqueItem[]>([]);
  const [locais, setLocais] = useState<LocalEstoque[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [localId, setLocalId] = useState("todos");
  const [situacao, setSituacao] = useState<SituacaoFilter>("todos");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [estoqueRes, locaisRes] = await Promise.all([
      fetch("/api/estoque"),
      fetch("/api/suprimentos/locais-estoque"),
    ]);
    const estoqueJson = await estoqueRes.json();
    const locaisJson  = await locaisRes.json();
    setItems(estoqueJson.data ?? estoqueJson ?? []);
    setLocais(Array.isArray(locaisJson) ? locaisJson : (locaisJson.data ?? []));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleSearch(val: string) {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {}, 300);
  }

  // 1. Filter rows by local (pre-aggregation) — always exclude entries without localEstoque
  const itemsComLocal = items.filter((e) => e.localEstoque !== null);
  const preFiltered = localId === "todos"
    ? itemsComLocal
    : itemsComLocal.filter((e) => e.localEstoque?.id === localId);

  // 2. Aggregate by product
  const productMap = new Map<string, ProdutoRow>();
  for (const e of preFiltered) {
    const existing = productMap.get(e.item.id);
    const terceiro = !!e.clienteDono;
    const qty  = toNum(e.quantidadeAtual);
    // min/max valem só para o estoque próprio — guarda de terceiro não repõe
    const min  = terceiro ? 0 : toNum(e.quantidadeMin);
    const max  = terceiro ? null : (e.quantidadeMax ? toNum(e.quantidadeMax) : null);
    if (!existing) {
      productMap.set(e.item.id, {
        itemId:      e.item.id,
        codigo:      e.item.codigo,
        descricao:   e.item.descricao,
        ativo:       e.item.ativo,
        unidade:     e.item.unidade?.sigla || e.item.unidadeMedida,
        qtdTotal:    qty,
        qtdTerceiros: terceiro ? qty : 0,
        minTotal:    min,
        maxTotal:    max,
        locaisCount: 1,
      });
    } else {
      existing.qtdTotal     += qty;
      if (terceiro) existing.qtdTerceiros += qty;
      existing.minTotal     += min;
      existing.maxTotal      = (existing.maxTotal !== null && max !== null) ? existing.maxTotal + max : existing.maxTotal ?? max;
      existing.locaisCount  += 1;
    }
  }

  const aggregated = Array.from(productMap.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));

  // 3. Filter aggregated by search and situação
  const q = search.toLowerCase().trim();
  const filtered = aggregated.filter((p) => {
    if (q && !p.codigo.toLowerCase().includes(q) && !p.descricao.toLowerCase().includes(q)) return false;
    const propria = p.qtdTotal - p.qtdTerceiros;
    const abaixo = p.minTotal > 0 && propria < p.minTotal;
    const acima  = p.maxTotal !== null && propria > p.maxTotal;
    if (situacao === "baixo"  && !abaixo) return false;
    if (situacao === "acima"  && !acima)  return false;
    if (situacao === "normal" && (abaixo || acima)) return false;
    return true;
  });

  // Summary counts (based on filtered items list — only entries with location)
  const allProductMap = new Map<string, { qtd: number; min: number }>();
  for (const e of itemsComLocal) {
    const ex = allProductMap.get(e.item.id);
    // contagem de "abaixo do mínimo" considera só o estoque próprio
    const qty = e.clienteDono ? 0 : toNum(e.quantidadeAtual);
    const min = e.clienteDono ? 0 : toNum(e.quantidadeMin);
    if (!ex) allProductMap.set(e.item.id, { qtd: qty, min });
    else { ex.qtd += qty; ex.min += min; }
  }
  const abaixoMinimo = Array.from(allProductMap.values()).filter(p => p.min > 0 && p.qtd < p.min).length;

  const hasFilters  = search || localId !== "todos" || situacao !== "todos";
  const totalUnique = productMap.size; // after local filter

  // Column order
  const [colOrder, setColOrder] = useColumnOrder("estoque", COLS.map((c) => c.id));
  const [colVis, setColVis, showAllCols] = useColumnVisibility("estoque", COLS.map((c) => c.id));
  const orderedCols = colOrder.map((id) => COLS.find((c) => c.id === id)).filter((c): c is ColDef<ProdutoRow> => c !== undefined && colVis[c.id] !== false);

  const localOptions: FilterOption[] = [
    { key: "todos", label: "Todos os locais", color: "bg-gray-100 text-gray-600" },
    ...locais.map((l) => ({ key: l.id, label: l.nome, color: "bg-emerald-100 text-emerald-700" })),
  ];

  function clearFilters() { setSearch(""); setLocalId("todos"); setSituacao("todos"); }

  return (
    <div>
      <PageHeader
        title="Posição de Estoque"
        breadcrumbs={[{ label: "Suprimentos" }, { label: "Estoque" }, { label: "Posição de Estoque" }]}
      />
      <div className="px-8 pb-8 space-y-5">
        {/* Summary */}
        {abaixoMinimo > 0 && (
          <div className="flex gap-4">
            <div className="rounded-xl bg-red-50 px-4 py-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
              <div>
                <p className="text-xs text-red-600 font-medium">Abaixo min.</p>
                <p className="text-2xl font-bold text-red-700 mt-0.5">{abaixoMinimo}</p>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text" value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Buscar por código ou descrição..."
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {search && (
              <button onClick={() => handleSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <FilterDropdown
            label="Local"
            options={localOptions}
            value={localId}
            onChange={setLocalId}
            allKey="todos"
            placeholder="Selecione o local..."
          />

          <FilterDropdown
            label="Situação"
            options={SITUACAO_OPTIONS}
            value={situacao}
            onChange={(v) => setSituacao(v as SituacaoFilter)}
            allKey="todos"
            placeholder="Selecione a situação..."
          />

          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
              <X className="w-3 h-3" /> Limpar filtros
            </button>
          )}

          <ColumnConfigurator columns={COLS} order={colOrder} onOrderChange={setColOrder} visibility={colVis} onVisibilityChange={setColVis} onShowAll={showAllCols} />
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">{hasFilters ? "Nenhum produto encontrado com esses filtros" : "Nenhum produto em estoque"}</p>
            {!hasFilters && <p className="text-sm mt-1">O estoque é alimentado ao registrar movimentações de entrada.</p>}
            {hasFilters && <button onClick={clearFilters} className="mt-2 text-sm text-blue-500 hover:underline">Limpar filtros</button>}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-xs text-gray-600 uppercase tracking-wide font-semibold">
                  {orderedCols.map((col) => (
                    <th key={col.id} className={col.thClass}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filtered.map((p) => {
                  const abaixo = p.minTotal > 0 && p.qtdTotal < p.minTotal;
                  return (
                    <tr
                      key={p.itemId}
                      className={cn(
                        "hover:bg-blue-50/40 transition-colors",
                        abaixo && "bg-red-50/40 hover:bg-red-50/60",
                        !p.ativo && "opacity-50"
                      )}
                    >
                      {orderedCols.map((col) => (
                        <td key={col.id} className={col.tdClass}>{col.render(p)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-600 font-medium">
              {filtered.length} produto{filtered.length !== 1 ? "s" : ""}
              {localId !== "todos" && ` · filtrado por local`}
              {hasFilters && totalUnique !== filtered.length && ` (${totalUnique} no total)`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
