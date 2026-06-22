"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import FilterDropdown, { FilterOption } from "@/components/shared/FilterDropdown";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus, Search, X, Loader2, AlertTriangle, Trash2, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatBRL, decimalToNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useColumnOrder } from "@/lib/use-column-order";
import { useColumnVisibility } from "@/lib/use-column-visibility";
import ColumnConfigurator, { ColDef } from "@/components/shared/ColumnConfigurator";
import { CATEGORIA_ESTOQUE_VALUES, CATEGORIA_ESTOQUE_LABELS, CATEGORIA_ESTOQUE_ICONS, CATEGORIA_ESTOQUE_CORES } from "@/lib/categoria-estoque-ui";
import type { CategoriaEstoque } from "@prisma/client";

type Produto = {
  id: string;
  codigo: string;
  descricao: string;
  tipo: string;
  ativo: boolean;
  precoCusto: unknown;
  unidadeMedida: string;
  unidade: { sigla: string } | null;
  categoriaEstoque: CategoriaEstoque | null;
  estoqueItems: Array<{ quantidadeAtual: unknown; localEstoque: { nome: string } | null }>;
};

type AtivoFilter = "todos" | "ativos" | "inativos";

// ── Column definitions ────────────────────────────────────────────────────────
let _prodSearch = "";

const COLS: ColDef<Produto>[] = [
  {
    id: "codigo",
    label: "Código",
    thClass: "text-left px-4 py-3 font-medium text-muted-foreground",
    tdClass: "px-4 py-3 font-mono text-xs text-foreground",
    render: (item) => _prodSearch ? <Highlight text={item.codigo} query={_prodSearch} /> : item.codigo,
  },
  {
    id: "descricao",
    label: "Descrição",
    thClass: "text-left px-4 py-3 font-medium text-muted-foreground",
    tdClass: "px-4 py-3 font-medium text-foreground",
    render: (item) => _prodSearch ? <Highlight text={item.descricao} query={_prodSearch} /> : item.descricao,
  },
  {
    id: "categoria",
    label: "Categoria",
    thClass: "text-left px-4 py-3 font-medium text-muted-foreground",
    tdClass: "px-4 py-3 text-muted-foreground",
    render: (item) => {
      if (!item.categoriaEstoque) return <span className="text-muted-foreground">—</span>;
      const Icon = CATEGORIA_ESTOQUE_ICONS[item.categoriaEstoque];
      return (
        <span className="inline-flex items-center gap-1.5 text-xs">
          <Icon className={cn("w-3.5 h-3.5 shrink-0", CATEGORIA_ESTOQUE_CORES[item.categoriaEstoque])} />
          {CATEGORIA_ESTOQUE_LABELS[item.categoriaEstoque]}
        </span>
      );
    },
  },
  {
    id: "unidade",
    label: "Unidade",
    thClass: "text-left px-4 py-3 font-medium text-muted-foreground",
    tdClass: "px-4 py-3 text-muted-foreground",
    render: (item) => item.unidade?.sigla || item.unidadeMedida,
  },
  {
    id: "estoque",
    label: "Estoque",
    thClass: "text-right px-4 py-3 font-medium text-muted-foreground",
    tdClass: "px-4 py-3 text-right text-foreground",
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
    thClass: "text-right px-4 py-3 font-medium text-muted-foreground",
    tdClass: "px-4 py-3 text-right text-foreground",
    render: (item) =>
      item.precoCusto
        ? <span title="Custo Médio Ponderado Móvel (atualizado a cada entrada)">{formatBRL(decimalToNumber(item.precoCusto))}</span>
        : <span className="text-muted-foreground text-xs">Sem entradas</span>,
  },
  {
    id: "custoTotal",
    label: "Custo Total",
    thClass: "text-right px-4 py-3 font-medium text-muted-foreground",
    tdClass: "px-4 py-3 text-right",
    render: (item) => {
      const estoqueTotal = item.estoqueItems.reduce(
        (s, e) => s + decimalToNumber(e.quantidadeAtual), 0
      );
      return item.precoCusto && estoqueTotal > 0
        ? <span className="font-semibold text-info">{formatBRL(decimalToNumber(item.precoCusto) * estoqueTotal)}</span>
        : <span className="text-muted-foreground/60">—</span>;
    },
  },
  {
    id: "status",
    label: "Status",
    thClass: "text-center px-4 py-3 font-medium text-muted-foreground",
    tdClass: "px-4 py-3 text-center",
    render: (item) => (
      <span className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        item.ativo ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
      )}>
        {item.ativo ? "Ativo" : "Inativo"}
      </span>
    ),
  },
];

const ATIVO_OPTIONS: FilterOption[] = [
  { key: "todos",    label: "Todos",    color: "bg-muted text-muted-foreground" },
  { key: "ativos",   label: "Ativos",   color: "bg-success/15 text-success" },
  { key: "inativos", label: "Inativos", color: "bg-danger/15 text-danger" },
];

export default function ProdutosPage() {
  const router = useRouter();
  const [items, setItems]           = useState<Produto[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [categoria, setCategoria]   = useState("todos");
  const [ativo, setAtivo]           = useState<AtivoFilter>("todos");
  const debounceRef                 = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Delete state
  const [deleteId, setDeleteId]       = useState<string | null>(null);
  const [deleting, setDeleting]       = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async (q: string, cat: string, at: AtivoFilter) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim())       params.set("q", q.trim());
    if (cat !== "todos") params.set("categoria", cat);
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
    debounceRef.current = setTimeout(() => load(val, categoria, ativo), 300);
  }

  function handleCategoria(val: string) {
    setCategoria(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    load(search, val, ativo);
  }

  function handleAtivo(val: string) {
    const at = val as AtivoFilter;
    setAtivo(at);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    load(search, categoria, at);
  }

  function clearFilters() {
    setSearch(""); setCategoria("todos"); setAtivo("todos");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    load("", "todos", "todos");
  }

  const hasFilters   = search || categoria !== "todos" || ativo !== "todos";
  const deletingItem = items.find((i) => i.id === deleteId);

  // Column order
  _prodSearch = search;
  const [colOrder, setColOrder] = useColumnOrder("produtos", COLS.map((c) => c.id));
  const [colVis, setColVis, showAllCols] = useColumnVisibility("produtos", COLS.map((c) => c.id));
  const orderedCols = colOrder.map((id) => COLS.find((c) => c.id === id)).filter((c): c is ColDef<Produto> => c !== undefined && colVis[c.id] !== false);

  const categoriaOptions: FilterOption[] = [
    { key: "todos", label: "Todas", color: "bg-muted text-muted-foreground" },
    ...CATEGORIA_ESTOQUE_VALUES.map((c) => ({ key: c, label: CATEGORIA_ESTOQUE_LABELS[c], color: "bg-info/15 text-info" })),
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
      await load(search, categoria, ativo);
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
            <div className="bg-card rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-danger/15 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-danger" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Excluir produto?</p>
                  <p className="text-sm text-muted-foreground mt-0.5 font-medium text-foreground">
                    {deletingItem?.codigo} — {deletingItem?.descricao}
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Esta ação é permanente e não pode ser desfeita.
              </p>
              {deleteError && (
                <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 mb-4">
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Buscar por código ou descrição..."
              className="w-full pl-9 pr-8 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {search && (
              <button onClick={() => handleSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Categoria dropdown */}
          <FilterDropdown
            label="Categoria"
            options={categoriaOptions}
            value={categoria}
            onChange={handleCategoria}
            allKey="todos"
            placeholder="Selecione a categoria..."
          />

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
            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-muted-foreground transition-colors">
              <X className="w-3 h-3" />
              Limpar filtros
            </button>
          )}

          <ColumnConfigurator columns={COLS} order={colOrder} onOrderChange={setColOrder} visibility={colVis} onVisibilityChange={setColVis} onShowAll={showAllCols} />
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
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
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  {orderedCols.map((col) => (
                    <th key={col.id} className={col.thClass}>{col.label}</th>
                  ))}
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-info/10 transition-colors cursor-pointer"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("button, a")) return;
                      router.push(`/suprimentos/produtos/${item.id}`);
                    }}
                  >
                    {orderedCols.map((col) => (
                      <td key={col.id} className={col.tdClass}>{col.render(item)}</td>
                    ))}
                    <td className="px-4 py-3 text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost" size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-danger focus:text-danger focus:bg-danger/10"
                            onClick={(e) => { e.stopPropagation(); setDeleteId(item.id); setDeleteError(null); }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t border-border bg-muted text-xs text-muted-foreground">
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
      <mark className="bg-warning/15 text-yellow-900 rounded-sm px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
