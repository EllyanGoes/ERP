"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import FilterDropdown, { FilterOption } from "@/components/shared/FilterDropdown";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus, Search, X, Loader2, AlertTriangle, Trash2 } from "lucide-react";
import { formatBRL, decimalToNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useColumnOrder } from "@/lib/use-column-order";
import ColumnConfigurator, { ColDef } from "@/components/shared/ColumnConfigurator";

type TipoProduto = { id: string; nome: string };

type Produto = {
  id: string;
  codigo: string;
  descricao: string;
  tipo: string;
  ativo: boolean;
  precoCusto: unknown;
  unidadeMedida: string;
  unidade: { sigla: string } | null;
  tipoProduto: { id: string; nome: string } | null;
  estoqueItems: Array<{ quantidadeAtual: unknown; localEstoque: { nome: string } | null }>;
};

type AtivoFilter = "todos" | "ativos" | "inativos";

// ── Column definitions ────────────────────────────────────────────────────────
let _prodSearch = "";

const COLS: ColDef<Produto>[] = [
  {
    id: "codigo",
    label: "Código",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 font-mono text-xs text-gray-700",
    render: (item) => _prodSearch ? <Highlight text={item.codigo} query={_prodSearch} /> : item.codigo,
  },
  {
    id: "descricao",
    label: "Descrição",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 font-medium text-gray-900",
    render: (item) => _prodSearch ? <Highlight text={item.descricao} query={_prodSearch} /> : item.descricao,
  },
  {
    id: "tipoProduto",
    label: "Tipo de Produto",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 text-gray-600",
    render: (item) =>
      item.tipoProduto
        ? <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-md">{item.tipoProduto.nome}</span>
        : <span className="text-gray-400">—</span>,
  },
  {
    id: "unidade",
    label: "Unidade",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 text-gray-600",
    render: (item) => item.unidade?.sigla || item.unidadeMedida,
  },
  {
    id: "estoque",
    label: "Estoque",
    thClass: "text-right px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 text-right text-gray-700",
    render: (item) => {
      const estoqueTotal = item.estoqueItems.reduce(
        (s, e) => s + decimalToNumber(e.quantidadeAtual), 0
      );
      return item.estoqueItems.length > 0
        ? estoqueTotal.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 })
        : "—";
    },
  },
  {
    id: "custoMedio",
    label: "Custo Médio",
    thClass: "text-right px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 text-right text-gray-700",
    render: (item) =>
      item.precoCusto
        ? <span title="Custo Médio Ponderado Móvel (atualizado a cada entrada)">{formatBRL(decimalToNumber(item.precoCusto))}</span>
        : <span className="text-gray-400 text-xs">Sem entradas</span>,
  },
  {
    id: "custoTotal",
    label: "Custo Total",
    thClass: "text-right px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 text-right",
    render: (item) => {
      const estoqueTotal = item.estoqueItems.reduce(
        (s, e) => s + decimalToNumber(e.quantidadeAtual), 0
      );
      return item.precoCusto && estoqueTotal > 0
        ? <span className="font-semibold text-blue-700">{formatBRL(decimalToNumber(item.precoCusto) * estoqueTotal)}</span>
        : <span className="text-gray-300">—</span>;
    },
  },
  {
    id: "status",
    label: "Status",
    thClass: "text-center px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 text-center",
    render: (item) => (
      <span className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        item.ativo ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
      )}>
        {item.ativo ? "Ativo" : "Inativo"}
      </span>
    ),
  },
];

const ATIVO_OPTIONS: FilterOption[] = [
  { key: "todos",    label: "Todos",    color: "bg-gray-100 text-gray-600" },
  { key: "ativos",   label: "Ativos",   color: "bg-green-100 text-green-700" },
  { key: "inativos", label: "Inativos", color: "bg-red-100 text-red-700" },
];

export default function ProdutosPage() {
  const router = useRouter();
  const [items, setItems]           = useState<Produto[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [tipoProdutoId, setTipoProdutoId] = useState("todos");
  const [ativo, setAtivo]           = useState<AtivoFilter>("todos");
  const [tiposProduto, setTiposProduto] = useState<TipoProduto[]>([]);
  const debounceRef                 = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Delete state
  const [deleteId, setDeleteId]       = useState<string | null>(null);
  const [deleting, setDeleting]       = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Load tipos de produto for the filter
  useEffect(() => {
    fetch("/api/suprimentos/tipos-produto")
      .then((r) => r.json())
      .then((j) => setTiposProduto(Array.isArray(j) ? j : (j.data ?? [])));
  }, []);

  const load = useCallback(async (q: string, tpId: string, at: AtivoFilter) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim())       params.set("q", q.trim());
    if (tpId !== "todos") params.set("tipoProdutoId", tpId);
    if (at !== "todos") params.set("ativo", at === "ativos" ? "true" : "false");
    const res  = await fetch(`/api/suprimentos/produtos?${params}`);
    const json = await res.json();
    setItems(json.data ?? []);
    setLoading(false);
  }, []);

  // Initial load
  useEffect(() => { load("", "todos", "todos"); }, [load]);

  function handleSearch(val: string) {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(val, tipoProdutoId, ativo), 300);
  }

  function handleTipoProduto(val: string) {
    setTipoProdutoId(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    load(search, val, ativo);
  }

  function handleAtivo(val: string) {
    const at = val as AtivoFilter;
    setAtivo(at);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    load(search, tipoProdutoId, at);
  }

  function clearFilters() {
    setSearch(""); setTipoProdutoId("todos"); setAtivo("todos");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    load("", "todos", "todos");
  }

  const hasFilters   = search || tipoProdutoId !== "todos" || ativo !== "todos";
  const deletingItem = items.find((i) => i.id === deleteId);

  // Column order
  _prodSearch = search;
  const [colOrder, setColOrder] = useColumnOrder("produtos", COLS.map((c) => c.id));
  const orderedCols = colOrder.map((id) => COLS.find((c) => c.id === id)).filter((c): c is ColDef<Produto> => c !== undefined);

  // Build tipo produto filter options dynamically
  const tipoProdutoOptions: FilterOption[] = [
    { key: "todos", label: "Todos", color: "bg-gray-100 text-gray-600" },
    ...tiposProduto.map((tp) => ({ key: tp.id, label: tp.nome, color: "bg-blue-100 text-blue-700" })),
  ];

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true); setDeleteError(null);
    try {
      const res = await fetch(`/api/suprimentos/produtos/${deleteId}`, { method: "DELETE" });
      if (!res.ok) {
        setDeleteError((await res.json()).error || "Erro ao excluir");
        return;
      }
      setDeleteId(null);
      await load(search, tipoProdutoId, ativo);
    } catch {
      setDeleteError("Erro de conexão");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Produtos"
        breadcrumbs={[{ label: "Suprimentos" }, { label: "Produtos" }]}
        action={
          <Button asChild>
            <Link href="/suprimentos/produtos/novo">
              <Plus className="w-4 h-4 mr-2" />
              Novo Produto
            </Link>
          </Button>
        }
      />

      <div className="px-8 pb-8 space-y-5">
        {/* Delete confirmation dialog */}
        {deleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Excluir produto?</p>
                  <p className="text-sm text-gray-500 mt-0.5 font-medium text-gray-800">
                    {deletingItem?.codigo} — {deletingItem?.descricao}
                  </p>
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Esta ação é permanente e não pode ser desfeita.
              </p>
              {deleteError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
                  {deleteError}
                </p>
              )}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => { setDeleteId(null); setDeleteError(null); }} disabled={deleting}>
                  Cancelar
                </Button>
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                  Excluir
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Search + filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
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

          {/* Tipo de Produto dropdown — only if tipos exist */}
          {tiposProduto.length > 0 && (
            <FilterDropdown
              label="Tipo de Produto"
              options={tipoProdutoOptions}
              value={tipoProdutoId}
              onChange={handleTipoProduto}
              allKey="todos"
              placeholder="Selecione o tipo..."
            />
          )}

          {/* Status dropdown */}
          <FilterDropdown
            label="Status"
            options={ATIVO_OPTIONS}
            value={ativo}
            onChange={handleAtivo}
            allKey="todos"
            placeholder="Selecione o status..."
          />

          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-3 h-3" />
              Limpar filtros
            </button>
          )}

          <ColumnConfigurator columns={COLS} order={colOrder} onOrderChange={setColOrder} />
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
            <p className="font-medium">
              {hasFilters ? "Nenhum produto encontrado com esses filtros" : "Nenhum produto cadastrado"}
            </p>
            {hasFilters && (
              <button onClick={clearFilters} className="mt-2 text-sm text-blue-500 hover:underline">
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {orderedCols.map((col) => (
                    <th key={col.id} className={col.thClass}>{col.label}</th>
                  ))}
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("button, a")) return;
                      router.push(`/suprimentos/produtos/${item.id}`);
                    }}
                  >
                    {orderedCols.map((col) => (
                      <td key={col.id} className={col.tdClass}>{col.render(item)}</td>
                    ))}
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="ghost" size="sm"
                        className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50"
                        onClick={(e) => { e.stopPropagation(); setDeleteId(item.id); setDeleteError(null); }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
              {items.length} {items.length === 1 ? "produto" : "produtos"} encontrado{items.length === 1 ? "" : "s"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-100 text-yellow-900 rounded-sm px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
