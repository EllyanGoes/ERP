"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import FilterDropdown, { FilterOption } from "@/components/shared/FilterDropdown";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus, Search, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Fornecedor = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cpfCnpj: string | null;
  cidade: string | null;
  estado: string | null;
  ativo: boolean;
  _count: { produtos: number; pedidosCompra: number };
};

type AtivoFilter = "todos" | "ativos" | "inativos";

const ATIVO_OPTIONS: FilterOption[] = [
  { key: "todos",    label: "Todos",    color: "bg-gray-100 text-gray-600" },
  { key: "ativos",   label: "Ativos",   color: "bg-green-100 text-green-700" },
  { key: "inativos", label: "Inativos", color: "bg-red-100 text-red-700" },
];

export default function FornecedoresPage() {
  const router = useRouter();
  const [items, setItems]       = useState<Fornecedor[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [ativo, setAtivo]       = useState<AtivoFilter>("todos");
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string, at: AtivoFilter) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (at !== "todos") params.set("ativo", at === "ativos" ? "true" : "false");
    const res  = await fetch(`/api/suprimentos/fornecedores?${params}`);
    const json = await res.json();
    setItems(Array.isArray(json) ? json : (json.data ?? []));
    setLoading(false);
  }, []);

  // Initial load
  useEffect(() => { load("", "todos"); }, [load]);

  // Debounced search
  function handleSearch(val: string) {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(val, ativo), 300);
  }

  // Immediate filter change
  function handleAtivo(val: string) {
    const at = val as AtivoFilter;
    setAtivo(at);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    load(search, at);
  }

  const hasFilters  = search || ativo !== "todos";
  const totalAtivos = items.filter((f) => f.ativo).length;

  return (
    <div>
      <PageHeader
        title="Fornecedores"
        breadcrumbs={[{ label: "Suprimentos" }, { label: "Fornecedores" }]}
        action={
          <Button asChild>
            <Link href="/suprimentos/fornecedores/novo">
              <Plus className="w-4 h-4 mr-2" />
              Novo Fornecedor
            </Link>
          </Button>
        }
      />

      <div className="px-8 pb-8 space-y-5">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-4 max-w-xs">
          <div className="rounded-xl p-4 bg-blue-50 text-blue-700">
            <p className="text-sm font-medium opacity-75">Total</p>
            <p className="text-3xl font-bold mt-1">{items.length}</p>
          </div>
          <div className="rounded-xl p-4 bg-green-50 text-green-700">
            <p className="text-sm font-medium opacity-75">Ativos</p>
            <p className="text-3xl font-bold mt-1">{totalAtivos}</p>
          </div>
        </div>

        {/* Search + filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Buscar por nome, fantasia ou CNPJ..."
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {search && (
              <button
                onClick={() => handleSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status dropdown filter */}
          <FilterDropdown
            label="Status"
            options={ATIVO_OPTIONS}
            value={ativo}
            onChange={handleAtivo}
            allKey="todos"
            placeholder="Selecione o status..."
          />

          {/* Clear all filters */}
          {hasFilters && (
            <button
              onClick={() => { handleSearch(""); handleAtivo("todos"); }}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-3 h-3" />
              Limpar filtros
            </button>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
            <p className="font-medium">
              {hasFilters
                ? "Nenhum fornecedor encontrado com esses filtros"
                : "Nenhum fornecedor cadastrado"}
            </p>
            {hasFilters && (
              <button
                onClick={() => { handleSearch(""); handleAtivo("todos"); }}
                className="mt-2 text-sm text-blue-500 hover:underline"
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Razão Social</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Nome Fantasia</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">CPF/CNPJ</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Cidade/UF</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Produtos</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((f) => (
                  <tr
                    key={f.id}
                    className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                    onClick={() => router.push(`/suprimentos/fornecedores/${f.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {search ? <Highlight text={f.razaoSocial} query={search} /> : f.razaoSocial}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {f.nomeFantasia
                        ? search
                          ? <Highlight text={f.nomeFantasia} query={search} />
                          : f.nomeFantasia
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                      {f.cpfCnpj
                        ? search
                          ? <Highlight text={f.cpfCnpj} query={search} />
                          : f.cpfCnpj
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {f.cidade && f.estado
                        ? `${f.cidade}/${f.estado}`
                        : f.cidade || f.estado || "—"}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600 text-sm">
                      {f._count.produtos}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                        f.ativo ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      )}>
                        {f.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Result count */}
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
              {items.length} {items.length === 1 ? "fornecedor" : "fornecedores"} encontrado{items.length === 1 ? "" : "s"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Highlight matching text
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
