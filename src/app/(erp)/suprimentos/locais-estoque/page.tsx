"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Package, Plus, Pencil, Trash2, Loader2, AlertTriangle, X, Check, Save } from "lucide-react";
import { formatBRL } from "@/lib/utils";

type LocalRow = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  _count: { estoqueItens: number };
  estoqueItens: Array<{
    quantidadeAtual: unknown;
    item: { precoCusto: unknown } | null;
  }>;
};

function toNum(v: unknown) {
  if (v == null) return 0;
  return parseFloat(String(v));
}

export default function LocaisEstoquePage() {
  const router = useRouter();
  const [locais, setLocais] = useState<LocalRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ nome: "", descricao: "" });
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState("");

  // Edit modal
  const [editItem, setEditItem] = useState<LocalRow | null>(null);
  const [editForm, setEditForm] = useState({ nome: "", descricao: "", ativo: true });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // Delete modal
  const [deleteItem, setDeleteItem] = useState<LocalRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/suprimentos/locais-estoque");
    const json = await res.json();
    setLocais(Array.isArray(json) ? json : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setCreateForm({ nome: "", descricao: "" });
    setCreateError("");
    setShowCreate(true);
  }

  async function saveCreate() {
    if (!createForm.nome.trim()) return;
    setCreateSaving(true); setCreateError("");
    const res = await fetch("/api/suprimentos/locais-estoque", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: createForm.nome.trim(), descricao: createForm.descricao.trim() || undefined }),
    });
    if (!res.ok) {
      setCreateError((await res.json()).error || "Erro ao salvar");
      setCreateSaving(false); return;
    }
    setShowCreate(false); await load();
    setCreateSaving(false);
  }

  function openEdit(item: LocalRow, e: React.MouseEvent) {
    e.stopPropagation();
    setEditItem(item);
    setEditForm({ nome: item.nome, descricao: item.descricao ?? "", ativo: item.ativo });
    setEditError("");
  }

  async function saveEdit() {
    if (!editItem) return;
    setEditSaving(true); setEditError("");
    const res = await fetch(`/api/suprimentos/locais-estoque/${editItem.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: editForm.nome.trim(), descricao: editForm.descricao.trim() || undefined, ativo: editForm.ativo }),
    });
    if (!res.ok) {
      setEditError((await res.json()).error || "Erro ao salvar");
      setEditSaving(false); return;
    }
    setEditItem(null); await load();
    setEditSaving(false);
  }

  function openDelete(item: LocalRow, e: React.MouseEvent) {
    e.stopPropagation();
    setDeleteItem(item); setDeleteError("");
  }

  async function confirmDelete() {
    if (!deleteItem) return;
    setDeleteLoading(true); setDeleteError("");
    const res = await fetch(`/api/suprimentos/locais-estoque/${deleteItem.id}`, { method: "DELETE" });
    if (!res.ok) {
      setDeleteError((await res.json()).error || "Não foi possível excluir");
      setDeleteLoading(false); return;
    }
    setDeleteItem(null); await load();
    setDeleteLoading(false);
  }

  const totalProdutos = locais.reduce((s, l) => s + l._count.estoqueItens, 0);

  // Grand total cost: sum of (precoCusto × quantidadeAtual) across all locais
  const custoTotalGeral = locais.reduce((sum, local) => {
    return sum + local.estoqueItens.reduce((s, e) => {
      const custo = e.item?.precoCusto ? toNum(e.item.precoCusto) : 0;
      return s + custo * toNum(e.quantidadeAtual);
    }, 0);
  }, 0);

  return (
    <div>
      <PageHeader
        title="Locais de Estoque"
        breadcrumbs={[{ label: "Suprimentos" }, { label: "Estoque" }, { label: "Locais de Estoque" }]}
        action={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Local
          </Button>
        }
      />

      <div className="px-8 pb-8 space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4 max-w-lg">
          <div className="rounded-xl p-4 bg-emerald-50 text-emerald-700">
            <p className="text-sm font-medium opacity-75">Locais</p>
            <p className="text-3xl font-bold mt-1">{locais.length}</p>
          </div>
          <div className="rounded-xl p-4 bg-blue-50 text-blue-700">
            <p className="text-sm font-medium opacity-75">Produtos alocados</p>
            <p className="text-3xl font-bold mt-1">{totalProdutos}</p>
          </div>
          <div className="rounded-xl p-4 bg-violet-50 text-violet-700">
            <p className="text-sm font-medium opacity-75">Custo Total Estoque</p>
            <p className="text-xl font-bold mt-1">{custoTotalGeral > 0 ? formatBRL(custoTotalGeral) : "—"}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : locais.length === 0 ? (
          <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
            <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum local cadastrado</p>
            <p className="text-sm mt-1">Clique em &quot;Novo Local&quot; para começar.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Local</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Descrição</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Produtos</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Custo Total</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 w-20">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {locais.map((local) => {
                  const custoTotal = local.estoqueItens.reduce((s, e) => {
                    const custo = e.item?.precoCusto ? toNum(e.item.precoCusto) : 0;
                    return s + custo * toNum(e.quantidadeAtual);
                  }, 0);
                  return (
                    <tr
                      key={local.id}
                      className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                      onClick={() => router.push(`/suprimentos/locais-estoque/${local.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-emerald-500 shrink-0" />
                          <span className="font-medium text-gray-900">{local.nome}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{local.descricao || "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 text-gray-700">
                          <Package className="w-3.5 h-3.5 text-gray-400" />
                          {local._count.estoqueItens}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-violet-700">
                        {custoTotal > 0 ? formatBRL(custoTotal) : <span className="text-gray-300 font-normal">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${local.ativo ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {local.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={(e) => openEdit(local, e)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Editar"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => openDelete(local, e)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create Modal ───────────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                </div>
                <h3 className="font-semibold text-gray-900">Novo Local de Estoque</h3>
              </div>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Nome *</Label>
                <Input
                  value={createForm.nome}
                  onChange={(e) => setCreateForm((p) => ({ ...p, nome: e.target.value }))}
                  placeholder="Ex: Almoxarifado Central"
                  className="mt-1"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && saveCreate()}
                />
              </div>
              <div>
                <Label>Descrição</Label>
                <Input
                  value={createForm.descricao}
                  onChange={(e) => setCreateForm((p) => ({ ...p, descricao: e.target.value }))}
                  placeholder="Descrição opcional"
                  className="mt-1"
                />
              </div>
            </div>
            {createError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{createError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)} disabled={createSaving}>Cancelar</Button>
              <Button size="sm" onClick={saveCreate} disabled={createSaving || !createForm.nome.trim()}>
                {createSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ─────────────────────────────────────────────────── */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Editar Local de Estoque</h3>
              <button onClick={() => setEditItem(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Nome *</Label>
                <Input
                  value={editForm.nome}
                  onChange={(e) => setEditForm((p) => ({ ...p, nome: e.target.value }))}
                  className="mt-1"
                  autoFocus
                />
              </div>
              <div>
                <Label>Descrição</Label>
                <Input
                  value={editForm.descricao}
                  onChange={(e) => setEditForm((p) => ({ ...p, descricao: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="ativo-edit"
                  type="checkbox"
                  checked={editForm.ativo}
                  onChange={(e) => setEditForm((p) => ({ ...p, ativo: e.target.checked }))}
                  className="rounded"
                />
                <Label htmlFor="ativo-edit" className="cursor-pointer">Ativo</Label>
              </div>
            </div>
            {editError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{editError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setEditItem(null)} disabled={editSaving}>Cancelar</Button>
              <Button size="sm" onClick={saveEdit} disabled={editSaving || !editForm.nome.trim()}>
                {editSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Modal ───────────────────────────────────────────────── */}
      {deleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Excluir local?</p>
                <p className="text-sm text-gray-500 mt-0.5">{deleteItem.nome}</p>
              </div>
            </div>
            {deleteItem._count.estoqueItens > 0 && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                Este local possui {deleteItem._count.estoqueItens} produto(s) em estoque.
              </p>
            )}
            <p className="text-sm text-gray-600 mb-4">Esta ação é permanente e não pode ser desfeita.</p>
            {deleteError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{deleteError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteItem(null)} disabled={deleteLoading}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={confirmDelete} disabled={deleteLoading}>
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
