"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DollarSign,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  AlertTriangle,
  X,
  Save,
  Check,
  Search,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Grupo = {
  id: string;
  nome: string;
  ativo: boolean;
  _count: { centros: number };
};

type Centro = {
  id: string;
  codigo: string;
  nome: string;
  grupoCentroCustoId: string | null;
  grupoCentroCusto: { id: string; nome: string } | null;
  ativo: boolean;
};

// ── SelectGrupo ───────────────────────────────────────────────────────────────

function SelectGrupo({
  grupos,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  grupos: Grupo[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = grupos.find((g) => g.id === value);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((p) => !p)}
        className={cn(
          "flex items-center justify-between w-full px-3 py-2 text-sm rounded-lg border border-gray-200",
          "bg-white hover:border-gray-300 transition-colors text-left",
          disabled && "opacity-60 cursor-not-allowed",
          open && "border-blue-400 ring-1 ring-blue-200"
        )}
      >
        <span className={selected ? "text-gray-900" : "text-gray-400"}>
          {selected ? selected.nome : placeholder ?? "Selecionar grupo..."}
        </span>
        <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className="w-full px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 text-left"
            >
              (Nenhum)
            </button>
            {grupos.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => { onChange(g.id); setOpen(false); }}
                className={cn(
                  "w-full px-3 py-2 text-sm text-left hover:bg-blue-50 hover:text-blue-700 transition-colors",
                  g.id === value && "bg-blue-50 text-blue-700 font-medium"
                )}
              >
                {g.nome}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CentrosCustoPage() {
  const [centros,  setCentros]  = useState<Centro[]>([]);
  const [grupos,   setGrupos]   = useState<Grupo[]>([]);
  const [loading,  setLoading]  = useState(true);

  // Filters
  const [search,       setSearch]       = useState("");
  const [filtroGrupo,  setFiltroGrupo]  = useState("");
  const [filtroAtivo,  setFiltroAtivo]  = useState<"" | "true" | "false">("");

  // Create modal
  const [showCreate, setShowCreate]   = useState(false);
  const [createForm, setCreateForm]   = useState({ codigo: "", nome: "", grupoCentroCustoId: "" });
  const [createSaving, setCreateSaving] = useState(false);
  const [createError,  setCreateError]  = useState("");

  // Edit modal
  const [editItem,   setEditItem]   = useState<Centro | null>(null);
  const [editForm,   setEditForm]   = useState({ codigo: "", nome: "", grupoCentroCustoId: "", ativo: true });
  const [editSaving, setEditSaving] = useState(false);
  const [editError,  setEditError]  = useState("");

  // Delete modal
  const [deleteItem,    setDeleteItem]    = useState<Centro | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError,   setDeleteError]   = useState("");

  const loadGrupos = useCallback(async () => {
    const res = await fetch("/api/empresa/grupos-centro-custo");
    const json = await res.json();
    setGrupos(Array.isArray(json) ? json : []);
  }, []);

  const loadCentros = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search)      params.set("search", search);
    if (filtroGrupo) params.set("grupoId", filtroGrupo);
    if (filtroAtivo) params.set("ativo", filtroAtivo);
    const res  = await fetch(`/api/empresa/centros-custo?${params}`);
    const json = await res.json();
    setCentros(Array.isArray(json) ? json : []);
    setLoading(false);
  }, [search, filtroGrupo, filtroAtivo]);

  useEffect(() => { loadGrupos(); }, [loadGrupos]);
  useEffect(() => { loadCentros(); }, [loadCentros]);

  // ── Create ──────────────────────────────────────────────────────────────────

  function openCreate() {
    setCreateForm({ codigo: "", nome: "", grupoCentroCustoId: "" });
    setCreateError("");
    setShowCreate(true);
  }

  async function saveCreate() {
    if (!createForm.codigo.trim() || !createForm.nome.trim()) return;
    setCreateSaving(true); setCreateError("");
    const res = await fetch("/api/empresa/centros-custo", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        codigo:             createForm.codigo.trim(),
        nome:               createForm.nome.trim(),
        grupoCentroCustoId: createForm.grupoCentroCustoId || null,
      }),
    });
    if (!res.ok) {
      setCreateError((await res.json()).error || "Erro ao salvar");
      setCreateSaving(false); return;
    }
    setShowCreate(false);
    await loadCentros();
    setCreateSaving(false);
  }

  // ── Edit ────────────────────────────────────────────────────────────────────

  function openEdit(item: Centro, e: React.MouseEvent) {
    e.stopPropagation();
    setEditItem(item);
    setEditForm({
      codigo:             item.codigo,
      nome:               item.nome,
      grupoCentroCustoId: item.grupoCentroCustoId ?? "",
      ativo:              item.ativo,
    });
    setEditError("");
  }

  async function saveEdit() {
    if (!editItem) return;
    setEditSaving(true); setEditError("");
    const res = await fetch(`/api/empresa/centros-custo/${editItem.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        codigo:             editForm.codigo.trim(),
        nome:               editForm.nome.trim(),
        grupoCentroCustoId: editForm.grupoCentroCustoId || null,
        ativo:              editForm.ativo,
      }),
    });
    if (!res.ok) {
      setEditError((await res.json()).error || "Erro ao salvar");
      setEditSaving(false); return;
    }
    setEditItem(null);
    await loadCentros();
    setEditSaving(false);
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  function openDelete(item: Centro, e: React.MouseEvent) {
    e.stopPropagation();
    setDeleteItem(item); setDeleteError("");
  }

  async function confirmDelete() {
    if (!deleteItem) return;
    setDeleteLoading(true); setDeleteError("");
    const res = await fetch(`/api/empresa/centros-custo/${deleteItem.id}`, { method: "DELETE" });
    if (!res.ok) {
      setDeleteError((await res.json()).error || "Não foi possível excluir");
      setDeleteLoading(false); return;
    }
    setDeleteItem(null);
    await loadCentros();
    setDeleteLoading(false);
  }

  const ativos   = centros.filter((c) => c.ativo).length;
  const inativos = centros.filter((c) => !c.ativo).length;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="Centros de Custo"
        breadcrumbs={[
          { label: "Empresa" },
          { label: "Financeiro" },
          { label: "Centros de Custo" },
        ]}
        action={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Adicionar
          </Button>
        }
      />

      <div className="px-8 pb-8 space-y-5">
        {/* Summary */}
        <div className="flex items-center gap-4">
          <div className="rounded-xl px-5 py-3 bg-blue-50 text-blue-700 flex items-center gap-3">
            <DollarSign className="w-5 h-5 opacity-60" />
            <div>
              <p className="text-xs font-medium opacity-70">Total</p>
              <p className="text-2xl font-bold leading-none mt-0.5">{centros.length}</p>
            </div>
          </div>
          <div className="rounded-xl px-5 py-3 bg-emerald-50 text-emerald-700 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <div>
              <p className="text-xs font-medium opacity-70">Ativos</p>
              <p className="text-2xl font-bold leading-none mt-0.5">{ativos}</p>
            </div>
          </div>
          {inativos > 0 && (
            <div className="rounded-xl px-5 py-3 bg-gray-50 text-gray-500 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-gray-400" />
              <div>
                <p className="text-xs font-medium opacity-70">Inativos</p>
                <p className="text-2xl font-bold leading-none mt-0.5">{inativos}</p>
              </div>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar código ou nome..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          {/* Filtro grupo */}
          <div className="w-44">
            <SelectGrupo
              grupos={grupos}
              value={filtroGrupo}
              onChange={setFiltroGrupo}
              placeholder="Todos os grupos"
            />
          </div>

          {/* Filtro ativo */}
          <select
            value={filtroAtivo}
            onChange={(e) => setFiltroAtivo(e.target.value as "" | "true" | "false")}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-700"
          >
            <option value="">Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : centros.length === 0 ? (
          <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
            <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum centro de custo encontrado</p>
            <p className="text-sm mt-1">Clique em &quot;Adicionar&quot; para criar o primeiro.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-36">Código</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-44">Grupo</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 w-24">Ativo</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 w-20">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {centros.map((centro) => (
                  <tr key={centro.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                        {centro.codigo}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{centro.nome}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {centro.grupoCentroCusto ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-violet-50 text-violet-700">
                          {centro.grupoCentroCusto.nome}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                          centro.ativo
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-gray-100 text-gray-500"
                        )}
                      >
                        {centro.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={(e) => openEdit(centro, e)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => openDelete(centro, e)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create Modal ───────────────────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900">Adicionar centro de custo</h3>
              </div>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <Label>Código <span className="text-red-500">*</span></Label>
                <Input
                  value={createForm.codigo}
                  onChange={(e) => setCreateForm((p) => ({ ...p, codigo: e.target.value }))}
                  placeholder="Ex: 01.01"
                  className="mt-1"
                  autoFocus
                />
              </div>
              <div>
                <Label>Nome <span className="text-red-500">*</span></Label>
                <Input
                  value={createForm.nome}
                  onChange={(e) => setCreateForm((p) => ({ ...p, nome: e.target.value }))}
                  placeholder="Ex: Administrativo Geral"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Grupo de C. Custo</Label>
                <div className="mt-1">
                  <SelectGrupo
                    grupos={grupos}
                    value={createForm.grupoCentroCustoId}
                    onChange={(v) => setCreateForm((p) => ({ ...p, grupoCentroCustoId: v }))}
                  />
                </div>
              </div>
            </div>

            {createError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {createError}
              </p>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)} disabled={createSaving}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={saveCreate}
                disabled={createSaving || !createForm.codigo.trim() || !createForm.nome.trim()}
              >
                {createSaving
                  ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Salvando...</>
                  : <><Save className="w-4 h-4 mr-1" />Adicionar</>
                }
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ─────────────────────────────────────────────────────────── */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Editar centro de custo</h3>
              <button onClick={() => setEditItem(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <Label>Código <span className="text-red-500">*</span></Label>
                <Input
                  value={editForm.codigo}
                  onChange={(e) => setEditForm((p) => ({ ...p, codigo: e.target.value }))}
                  className="mt-1"
                  autoFocus
                />
              </div>
              <div>
                <Label>Nome <span className="text-red-500">*</span></Label>
                <Input
                  value={editForm.nome}
                  onChange={(e) => setEditForm((p) => ({ ...p, nome: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Grupo de C. Custo</Label>
                <div className="mt-1">
                  <SelectGrupo
                    grupos={grupos}
                    value={editForm.grupoCentroCustoId}
                    onChange={(v) => setEditForm((p) => ({ ...p, grupoCentroCustoId: v }))}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
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
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {editError}
              </p>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => setEditItem(null)} disabled={editSaving}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={saveEdit}
                disabled={editSaving || !editForm.codigo.trim() || !editForm.nome.trim()}
              >
                {editSaving
                  ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Salvando...</>
                  : <><Check className="w-4 h-4 mr-1" />Salvar</>
                }
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Modal ───────────────────────────────────────────────────────── */}
      {deleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Excluir centro de custo?</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{deleteItem.codigo}</span>
                  {" "}{deleteItem.nome}
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">Esta ação é permanente e não pode ser desfeita.</p>
            {deleteError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
                {deleteError}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteItem(null)} disabled={deleteLoading}>
                Cancelar
              </Button>
              <Button variant="destructive" size="sm" onClick={confirmDelete} disabled={deleteLoading}>
                {deleteLoading
                  ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Excluindo...</>
                  : <><Trash2 className="w-4 h-4 mr-1" />Excluir</>
                }
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
