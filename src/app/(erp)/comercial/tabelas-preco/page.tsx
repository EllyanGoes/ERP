"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Tag, CheckCircle2, XCircle, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";
import EmpresaTag from "@/components/shared/EmpresaTag";

type TabelaPreco = {
  id: string;
  empresaId?: string;
  codigo: string;
  descricao: string;
  dataInicial: string;
  dataFinal: string | null;
  condicaoPagamento: string | null;
  tipoHorario: string;
  ativa: boolean;
  ecommerce: boolean;
  _count: { itens: number };
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function TabelasPrecoPage() {
  useTabTitle("Tabelas de Preço");
  const router = useRouter();
  const [tabelas, setTabelas] = useState<TabelaPreco[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterAtiva, setFilterAtiva] = useState<"all" | "sim" | "nao">("all");

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ descricao: "", dataInicial: "", tipoHorario: "UNICO", ativa: true, ecommerce: false });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/comercial/tabelas-preco");
      const json = await res.json();
      setTabelas(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!form.descricao.trim()) { setCreateError("Descrição obrigatória"); return; }
    if (!form.dataInicial)      { setCreateError("Data Inicial obrigatória"); return; }
    setCreating(true); setCreateError("");
    try {
      const res = await fetch("/api/comercial/tabelas-preco", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) { setCreateError(json.error || "Erro ao criar"); return; }
      setShowCreate(false);
      router.push(`/comercial/tabelas-preco/${json.data.id}`);
    } catch { setCreateError("Erro de conexão"); }
    finally { setCreating(false); }
  }

  const filtered = tabelas.filter((t) => {
    const q = search.toLowerCase();
    const matchSearch = !q || t.codigo.toLowerCase().includes(q) || t.descricao.toLowerCase().includes(q);
    const matchAtiva  = filterAtiva === "all" || (filterAtiva === "sim" ? t.ativa : !t.ativa);
    return matchSearch && matchAtiva;
  });

  const totalAtivas   = tabelas.filter((t) => t.ativa).length;
  const totalInativas = tabelas.filter((t) => !t.ativa).length;

  return (
    <div>
      <PageHeader
        title="Tabelas de Preço"
        breadcrumbs={[{ label: "Comercial" }, { label: "Tabelas de Preço" }]}
        action={
          <Button onClick={() => { setShowCreate(true); setForm({ descricao: "", dataInicial: new Date().toISOString().slice(0,10), tipoHorario: "UNICO", ativa: true, ecommerce: false }); setCreateError(""); }}>
            <Plus className="w-4 h-4 mr-1.5" /> Nova Tabela
          </Button>
        }
      />

      <div className="px-8 pb-8 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl p-4 bg-blue-50 text-blue-700">
            <p className="text-sm font-medium opacity-75">Total</p>
            <p className="text-3xl font-bold mt-1">{tabelas.length}</p>
          </div>
          <div className="rounded-xl p-4 bg-green-50 text-green-700">
            <p className="text-sm font-medium opacity-75">Ativas</p>
            <p className="text-3xl font-bold mt-1">{totalAtivas}</p>
          </div>
          <div className="rounded-xl p-4 bg-gray-50 text-gray-600">
            <p className="text-sm font-medium opacity-75">Inativas</p>
            <p className="text-3xl font-bold mt-1">{totalInativas}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por código ou descrição..."
              className="pl-9"
            />
          </div>
          {(["all", "sim", "nao"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setFilterAtiva(v)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
                filterAtiva === v
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              )}
            >
              {v === "all" ? "Todas" : v === "sim" ? "Ativas" : "Inativas"}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
              <Tag className="w-10 h-10 opacity-30" />
              <p className="text-sm">Nenhuma tabela de preço encontrada</p>
              <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Nova Tabela
              </Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Código</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Descrição</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Data Inicial</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Data Final</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Tab. Ativa</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Itens</th>
                  <th className="w-12 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => router.push(`/comercial/tabelas-preco/${t.id}`)}
                    className="hover:bg-blue-50/40 cursor-pointer transition-colors group"
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-gray-800">{t.codigo} <EmpresaTag empresaId={t.empresaId} /></td>
                    <td className="px-4 py-3 font-medium text-gray-900 group-hover:text-blue-700">{t.descricao}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(t.dataInicial)}</td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(t.dataFinal)}</td>
                    <td className="px-4 py-3 text-center">
                      {t.ativa
                        ? <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                        : <XCircle    className="w-4 h-4 text-gray-300 mx-auto" />}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold">
                        {t._count.itens}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Pencil className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500 mx-auto transition-colors" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 pt-5 pb-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Nova Tabela de Preço</h2>
              <p className="text-xs text-gray-400 mt-0.5">O código será gerado automaticamente</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Descrição *</label>
                <Input
                  autoFocus
                  value={form.descricao}
                  onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                  placeholder="Ex: CIF - ENTREGA - CONSUMIDOR"
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Data Inicial *</label>
                <Input type="date" value={form.dataInicial} onChange={(e) => setForm((f) => ({ ...f, dataInicial: e.target.value }))} />
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.ativa} onChange={(e) => setForm((f) => ({ ...f, ativa: e.target.checked }))} className="w-4 h-4 accent-blue-600" />
                  <span className="text-sm text-gray-700">Tab. Ativa</span>
                </label>
              </div>
              {createError && <p className="text-xs text-red-600">{createError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleCreate} disabled={creating}>
                {creating ? "Criando..." : "Criar Tabela"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
