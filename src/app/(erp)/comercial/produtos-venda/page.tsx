"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus, Search, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";

type Produto = {
  id: string;
  codigo: string;
  descricao: string;
  ativo: boolean;
  precoVenda: unknown;
  unidadeMedida: string;
  unidade: { sigla: string } | null;
  tipoProduto: { id: string; nome: string } | null;
};

export default function ProdutosVendaPage() {
  useTabTitle("Produtos p/ Venda");
  const router = useRouter();
  const [items,   setItems]   = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    const params = new URLSearchParams({ vendavel: "true", ativo: "true" });
    if (q.trim()) params.set("q", q.trim());
    const res  = await fetch(`/api/suprimentos/produtos?${params}`);
    const json = await res.json();
    setItems(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(""); }, [load]);

  function handleSearch(val: string) {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(val), 300);
  }

  return (
    <div>
      <PageHeader
        title="Produtos para Venda"
        breadcrumbs={[{ label: "Comercial" }, { label: "Produtos para Venda" }]}
        action={
          <Button asChild>
            <Link href="/suprimentos/produtos/novo?vendavel=1">
              <Plus className="w-4 h-4 mr-2" />
              Novo Produto
            </Link>
          </Button>
        }
      />

      <div className="px-8 pb-8 space-y-5">
        {/* Search bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Buscar por código ou descrição..."
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {search && (
              <button onClick={() => handleSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
            <p className="font-medium">
              {search ? "Nenhum produto encontrado" : "Nenhum produto marcado como vendável"}
            </p>
            {!search && (
              <p className="text-sm mt-1">
                Acesse o cadastro de produtos e marque o check &quot;Este produto é vendável&quot;.
              </p>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-600 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Código</th>
                  <th className="text-left px-4 py-3 font-semibold">Descrição</th>
                  <th className="text-left px-4 py-3 font-semibold">Tipo</th>
                  <th className="text-center px-4 py-3 font-semibold w-16">U.M.</th>
                  <th className="text-center px-4 py-3 font-semibold w-24">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                    onClick={() => router.push(`/suprimentos/produtos/${item.id}`)}
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700">{item.codigo}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{item.descricao}</td>
                    <td className="px-4 py-3">
                      {item.tipoProduto
                        ? <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-md">{item.tipoProduto.nome}</span>
                        : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-mono text-xs text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                        {item.unidade?.sigla || item.unidadeMedida || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                        item.ativo ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      )}>
                        {item.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
              {items.length} {items.length === 1 ? "produto" : "produtos"} para venda
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
