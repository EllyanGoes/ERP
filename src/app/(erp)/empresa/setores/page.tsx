"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Layers,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  Save,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Setor = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  _count: { colaboradores: number };
};

// ── Field helper ──────────────────────────────────────────────────────────────

function Field({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SetoresPage() {
  const [setores, setSetores]   = useState<Setor[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search,  setSearch]    = useState("");

  // Form state (shared create/edit)
  const [formOpen,    setFormOpen]    = useState(false);
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [fNome,       setFNome]       = useState("");
  const [fDescricao,  setFDescricao]  = useState("");
  const [fAtivo,      setFAtivo]      = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [formError,   setFormError]   = useState("");

  // Delete
  const [deleteId,      setDeleteId]      = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError,   setDeleteError]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/empresa/setores");
    const data = await res.json();
    setSetores(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditingId(null);
    setFNome("");
    setFDescricao("");
    setFAtivo(true);
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(s: Setor) {
    setEditingId(s.id);
    setFNome(s.nome);
    setFDescricao(s.descricao ?? "");
    setFAtivo(s.ativo);
    setFormError("");
    setFormOpen(true);
  }

  async function handleSave() {
    if (!fNome.trim()) { setFormError("Nome é obrigatório"); return; }
    setSaving(true); setFormError("");
    try {
      const url    = editingId ? `/api/empresa/setores/${editingId}` : "/api/empresa/setores";
      const method = editingId ? "PATCH" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: fNome.trim(), descricao: fDescricao.trim() || null, ativo: fAtivo }),
      });
      const json = await res.json();
      if (!res.ok) { setFormError(json.error || "Erro ao salvar"); return; }
      await load();
      setFormOpen(false);
    } catch {
      setFormError("Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleteLoading(true); setDeleteError("");
    try {
      const res  = await fetch(`/api/empresa/setores/${deleteId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) { setDeleteError(json.error || "Erro ao excluir"); return; }
      await load();
      setDeleteId(null);
    } catch {
      setDeleteError("Erro de conexão. Tente novamente.");
    } finally {
      setDeleteLoading(false);
    }
  }

  const filtered = setores.filter((s) =>
    s.nome.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <PageHeader
        title="Setores"
        breadcrumbs={[{ label: "Empresa" }, { label: "Setores" }]}
        action={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" /> Novo Setor
          </Button>
        }
      />

      <div className="px-8 pb-8 max-w-3xl space-y-4">

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Buscar setores..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Form */}
        {formOpen && (
          <div className="border border-gray-200 rounded-xl p-5 bg-white space-y-4 shadow-sm">
            <h3 className="font-semibold text-sm text-gray-700">
              {editingId ? "Editar Setor" : "Novo Setor"}
            </h3>

            {formError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {formError}
              </p>
            )}

            <Field label="Nome" required>
              <Input
                value={fNome}
                onChange={(e) => setFNome(e.target.value)}
                placeholder="Ex: Compras, TI, RH..."
                autoFocus
              />
            </Field>

            <Field label="Descrição">
              <Textarea
                value={fDescricao}
                onChange={(e) => setFDescricao(e.target.value)}
                rows={2}
                placeholder="Opcional"
              />
            </Field>

            <div className="flex items-center gap-2">
              <input
                id="f-ativo"
                type="checkbox"
                checked={fAtivo}
                onChange={(e) => setFAtivo(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="f-ativo" className="cursor-pointer">Ativo</Label>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setFormOpen(false)} disabled={saving}>
                <X className="w-4 h-4 mr-1" /> Cancelar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-1" />Salvando...</>
                ) : (
                  <><Save className="w-4 h-4 mr-1" />Salvar</>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Delete confirm */}
        {deleteId && (
          <div className="border border-red-200 rounded-xl p-4 bg-red-50 space-y-3">
            <p className="text-sm text-red-700 font-medium">
              Confirmar exclusão do setor &ldquo;{setores.find((s) => s.id === deleteId)?.nome}&rdquo;?
            </p>
            {deleteError && (
              <p className="text-sm text-red-600">{deleteError}</p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteId(null)} disabled={deleteLoading}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={handleDelete}
                disabled={deleteLoading}
              >
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
                Excluir
              </Button>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Layers className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-gray-500 font-medium">Nenhum setor encontrado</p>
            {search && <p className="text-gray-400 text-sm mt-1">Tente outro termo de busca</p>}
          </div>
        ) : (
          <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
            {filtered.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    s.ativo ? "bg-emerald-400" : "bg-gray-300"
                  )} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{s.nome}</p>
                    {s.descricao && (
                      <p className="text-xs text-gray-400 truncate">{s.descricao}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0 ml-4">
                  <span className="text-xs text-gray-400">
                    {s._count.colaboradores} colaborador{s._count.colaboradores !== 1 ? "es" : ""}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => openEdit(s)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => { setDeleteId(s.id); setDeleteError(""); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
