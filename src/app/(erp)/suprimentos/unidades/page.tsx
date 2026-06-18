"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus, Pencil, Trash2, Loader2, X, Save, AlertTriangle,
  ArrowRight, Search, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";

// ── Types ─────────────────────────────────────────────────────────────────────
type Unidade = { id: string; sigla: string; nome: string; ativo: boolean };
type Conversao = {
  id: string;
  fator: unknown;
  unidadeDestino: { id: string; sigla: string; nome: string };
};

function toNum(v: unknown) { return parseFloat(String(v ?? 0)); }

// ── Component ─────────────────────────────────────────────────────────────────
export default function UnidadesPage() {
  const [unidades, setUnidades]     = useState<Unidade[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");

  // Selected unit
  const [selected, setSelected]     = useState<Unidade | null>(null);

  // ── Create unit ──────────────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ sigla: "", nome: "" });
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError]   = useState("");

  // ── Edit unit ────────────────────────────────────────────────────────────────
  const [editUnit, setEditUnit]     = useState<Unidade | null>(null);
  const [editForm, setEditForm]     = useState({ sigla: "", nome: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError]   = useState("");

  // ── Delete unit ──────────────────────────────────────────────────────────────
  const [deleteUnit, setDeleteUnit]         = useState<Unidade | null>(null);
  const [deleteLoading, setDeleteLoading]   = useState(false);
  const [deleteError, setDeleteError]       = useState("");

  // ── Conversions ──────────────────────────────────────────────────────────────
  const [conversoes, setConversoes]         = useState<Conversao[]>([]);
  const [convLoading, setConvLoading]       = useState(false);

  // Add conversion
  const [showAddConv, setShowAddConv]       = useState(false);
  const [addDestId, setAddDestId]           = useState("");
  const [addFator, setAddFator]             = useState("");
  const [addConvSaving, setAddConvSaving]   = useState(false);
  const [addConvError, setAddConvError]     = useState("");

  // Edit conversion
  const [editConvId, setEditConvId]         = useState<string | null>(null);
  const [editConvFator, setEditConvFator]   = useState("");
  const [editConvSaving, setEditConvSaving] = useState(false);
  const [editConvError, setEditConvError]   = useState("");

  // Delete conversion
  const [deleteConvId, setDeleteConvId]     = useState<string | null>(null);
  const [deleteConvLoading, setDeleteConvLoading] = useState(false);
  const [deleteConvError, setDeleteConvError]     = useState("");

  // ── Load units ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch("/api/suprimentos/unidades");
    const data = await res.json();
    const list: Unidade[] = Array.isArray(data) ? data : [];
    setUnidades(list);
    // Keep selected in sync
    setSelected((prev) => prev ? (list.find(u => u.id === prev.id) ?? null) : null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Load conversions for selected unit ───────────────────────────────────────
  const loadConversoes = useCallback(async (unitId: string) => {
    setConvLoading(true);
    const res  = await fetch(`/api/suprimentos/unidades/${unitId}/conversoes`);
    const data = await res.json();
    setConversoes(Array.isArray(data) ? data : []);
    setConvLoading(false);
  }, []);

  function selectUnit(u: Unidade) {
    setSelected(u);
    setShowAddConv(false);
    setAddDestId(""); setAddFator("");
    setEditConvId(null);
    loadConversoes(u.id);
  }

  // ── Unit CRUD ─────────────────────────────────────────────────────────────────
  async function createUnit() {
    if (!createForm.sigla.trim() || !createForm.nome.trim()) return;
    setCreateSaving(true); setCreateError("");
    const res = await fetch("/api/suprimentos/unidades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sigla: createForm.sigla.trim(), nome: createForm.nome.trim() }),
    });
    if (!res.ok) { setCreateError((await res.json()).error || "Erro ao salvar"); setCreateSaving(false); return; }
    setShowCreate(false); setCreateForm({ sigla: "", nome: "" });
    await load();
    setCreateSaving(false);
  }

  async function saveEditUnit() {
    if (!editUnit) return;
    setEditSaving(true); setEditError("");
    const res = await fetch(`/api/suprimentos/unidades/${editUnit.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sigla: editForm.sigla.trim(), nome: editForm.nome.trim() }),
    });
    if (!res.ok) { setEditError((await res.json()).error || "Erro ao salvar"); setEditSaving(false); return; }
    setEditUnit(null);
    await load();
    setEditSaving(false);
  }

  async function confirmDeleteUnit() {
    if (!deleteUnit) return;
    setDeleteLoading(true); setDeleteError("");
    const res = await fetch(`/api/suprimentos/unidades/${deleteUnit.id}`, { method: "DELETE" });
    if (!res.ok) { setDeleteError((await res.json()).error || "Erro ao excluir"); setDeleteLoading(false); return; }
    setDeleteUnit(null);
    if (selected?.id === deleteUnit.id) { setSelected(null); setConversoes([]); }
    await load();
    setDeleteLoading(false);
  }

  // ── Conversion CRUD ──────────────────────────────────────────────────────────
  async function addConversao() {
    if (!selected || !addDestId || !addFator) return;
    setAddConvSaving(true); setAddConvError("");
    const res = await fetch(`/api/suprimentos/unidades/${selected.id}/conversoes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unidadeDestinoId: addDestId, fator: parseFloat(addFator) }),
    });
    if (!res.ok) { setAddConvError((await res.json()).error || "Erro ao salvar"); setAddConvSaving(false); return; }
    setShowAddConv(false); setAddDestId(""); setAddFator(""); setAddConvError("");
    await loadConversoes(selected.id);
    setAddConvSaving(false);
  }

  async function saveEditConv() {
    if (!selected || !editConvId) return;
    setEditConvSaving(true); setEditConvError("");
    const res = await fetch(`/api/suprimentos/unidades/${selected.id}/conversoes/${editConvId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fator: parseFloat(editConvFator) }),
    });
    if (!res.ok) { setEditConvError((await res.json()).error || "Erro ao salvar"); setEditConvSaving(false); return; }
    setEditConvId(null);
    await loadConversoes(selected.id);
    setEditConvSaving(false);
  }

  async function confirmDeleteConv() {
    if (!selected || !deleteConvId) return;
    setDeleteConvLoading(true); setDeleteConvError("");
    const res = await fetch(`/api/suprimentos/unidades/${selected.id}/conversoes/${deleteConvId}`, { method: "DELETE" });
    if (!res.ok) { setDeleteConvError((await res.json()).error || "Erro ao excluir"); setDeleteConvLoading(false); return; }
    setDeleteConvId(null);
    await loadConversoes(selected.id);
    setDeleteConvLoading(false);
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const filteredUnidades = unidades.filter((u) => {
    const q = search.toLowerCase();
    return u.sigla.toLowerCase().includes(q) || u.nome.toLowerCase().includes(q);
  });

  // Units available for conversion destination (exclude self + already added)
  const usedDestIds = new Set([
    ...(selected ? [selected.id] : []),           // never show self
    ...conversoes.map(c => c.unidadeDestino.id),  // never show already-converted
  ]);
  const convDestOptions = unidades
    .filter((u) => !usedDestIds.has(u.id))
    .map((u) => ({ value: u.id, label: `${u.sigla} — ${u.nome}` }));

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="Unidades de Medida"
        breadcrumbs={[{ label: "Suprimentos" }, { label: "Cadastros" }, { label: "Unidades de Medida" }]}
      />

      <div className="px-8 pb-8">
        <div className="flex gap-4 h-[calc(100vh-180px)] min-h-[500px]">

          {/* ── Left panel: unit list ─────────────────────────────────────── */}
          <div className="w-72 shrink-0 flex flex-col rounded-xl border border-border bg-card overflow-hidden">
            {/* Search + add */}
            <div className="p-3 border-b border-border space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg bg-muted focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <Button size="sm" className="w-full" onClick={() => { setShowCreate(true); setCreateForm({ sigla: "", nome: "" }); setCreateError(""); }}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Nova Unidade
              </Button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : filteredUnidades.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  {search ? "Nenhuma unidade encontrada" : "Nenhuma unidade cadastrada"}
                </div>
              ) : (
                filteredUnidades.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => selectUnit(u)}
                    className={cn(
                      "group flex items-center justify-between px-3 py-2.5 cursor-pointer border-b border-gray-50 transition-colors",
                      selected?.id === u.id
                        ? "bg-info/10 border-l-2 border-l-blue-500"
                        : "hover:bg-muted"
                    )}
                  >
                    <div className="min-w-0">
                      <p className={cn("text-sm font-semibold font-mono", selected?.id === u.id ? "text-info" : "text-foreground")}>
                        {u.sigla}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{u.nome}</p>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditUnit(u); setEditForm({ sigla: u.sigla, nome: u.nome }); setEditError(""); }}
                        className="p-1 rounded text-muted-foreground hover:text-info hover:bg-info/10"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteUnit(u); setDeleteError(""); }}
                        className="p-1 rounded text-muted-foreground hover:text-danger hover:bg-danger/10"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer count */}
            <div className="px-3 py-2 border-t border-border text-xs text-muted-foreground">
              {unidades.length} unidade{unidades.length !== 1 ? "s" : ""}
            </div>
          </div>

          {/* ── Right panel: conversions ──────────────────────────────────── */}
          <div className="flex-1 flex flex-col rounded-xl border border-border bg-card overflow-hidden">
            {!selected ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <ArrowRight className="w-8 h-8 opacity-20" />
                <p className="text-sm font-medium">Selecione uma unidade</p>
                <p className="text-xs">As conversões aparecerão aqui</p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-info/10 flex items-center justify-center">
                      <span className="font-bold text-info text-sm font-mono">{selected.sigla}</span>
                    </div>
                    <div>
                      <h2 className="font-semibold text-foreground">{selected.nome}</h2>
                      <p className="text-xs text-muted-foreground">Conversões de <span className="font-mono font-semibold">{selected.sigla}</span></p>
                    </div>
                  </div>
                  {!showAddConv && (
                    <Button size="sm" variant="outline" onClick={() => { setShowAddConv(true); setAddDestId(""); setAddFator(""); setAddConvError(""); }}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar
                    </Button>
                  )}
                </div>

                {/* Add conversion inline form */}
                {showAddConv && (
                  <div className="px-5 py-3 bg-info/10 border-b border-info/20">
                    <p className="text-xs font-medium text-info mb-2">Nova conversão</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-mono font-semibold text-foreground shrink-0">1 {selected.sigla} =</span>
                      <div className="w-28">
                        <Input
                          type="number"
                          step="any"
                          min="0.000001"
                          value={addFator}
                          onChange={(e) => setAddFator(e.target.value)}
                          placeholder="Fator"
                          className="h-8 text-sm text-right"
                          autoFocus
                        />
                      </div>
                      <div className="w-52">
                        <ComboboxWithCreate
                          key={selected?.id}
                          options={convDestOptions}
                          value={addDestId}
                          onChange={setAddDestId}
                          allowNone={false}
                          placeholder="Selecionar unidade..."
                          triggerClassName="h-8 text-sm"
                        />
                      </div>
                      <Button size="sm" onClick={addConversao} disabled={addConvSaving || !addDestId || !addFator}>
                        {addConvSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowAddConv(false)} disabled={addConvSaving}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    {addConvError && <p className="text-xs text-danger mt-1">{addConvError}</p>}
                  </div>
                )}

                {/* Conversions list */}
                <div className="flex-1 overflow-y-auto">
                  {convLoading ? (
                    <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                  ) : conversoes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                      <p className="text-sm font-medium">Nenhuma conversão cadastrada</p>
                      <p className="text-xs">Clique em &quot;Adicionar&quot; para definir equivalências.</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-muted border-b border-border sticky top-0">
                        <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                          <th className="text-left px-5 py-2.5 font-medium">Origem</th>
                          <th className="text-center px-4 py-2.5 font-medium">Fator</th>
                          <th className="text-left px-4 py-2.5 font-medium">Destino</th>
                          <th className="w-20" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {conversoes.map((c) => (
                          <tr key={c.id} className="group/row hover:bg-muted transition-colors">
                            <td className="px-5 py-3">
                              <span className="font-mono text-sm font-semibold text-foreground">1 {selected.sigla}</span>
                              <span className="text-xs text-muted-foreground ml-1">({selected.nome})</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {editConvId === c.id ? (
                                <div className="flex items-center gap-1 justify-center">
                                  <Input
                                    type="number"
                                    step="any"
                                    value={editConvFator}
                                    onChange={(e) => setEditConvFator(e.target.value)}
                                    className="h-7 w-28 text-sm text-right"
                                    autoFocus
                                    onKeyDown={(e) => { if (e.key === "Enter") saveEditConv(); if (e.key === "Escape") setEditConvId(null); }}
                                  />
                                  <button onClick={saveEditConv} disabled={editConvSaving} className="p-1 rounded text-success hover:bg-success/10">
                                    {editConvSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                  </button>
                                  <button onClick={() => setEditConvId(null)} className="p-1 rounded text-muted-foreground hover:bg-muted">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                  {editConvError && <span className="text-xs text-danger ml-1">{editConvError}</span>}
                                </div>
                              ) : (
                                <span
                                  className="inline-block bg-info/15 text-info font-bold text-sm px-3 py-0.5 rounded-full font-mono cursor-pointer hover:bg-blue-200 transition-colors"
                                  onClick={() => { setEditConvId(c.id); setEditConvFator(String(toNum(c.fator))); setEditConvError(""); }}
                                  title="Clique para editar"
                                >
                                  {toNum(c.fator).toLocaleString("pt-BR", { maximumFractionDigits: 6 })}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-mono text-sm font-semibold text-foreground">{c.unidadeDestino.sigla}</span>
                              <span className="text-xs text-muted-foreground ml-1">({c.unidadeDestino.nome})</span>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center justify-end gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                <button
                                  onClick={() => { setEditConvId(c.id); setEditConvFator(String(toNum(c.fator))); setEditConvError(""); }}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-info hover:bg-info/10"
                                  title="Editar fator"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => { setDeleteConvId(c.id); setDeleteConvError(""); }}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10"
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
                  )}
                </div>

                {/* Footer */}
                {conversoes.length > 0 && (
                  <div className="px-5 py-2.5 border-t border-border text-xs text-muted-foreground">
                    {conversoes.length} conversão{conversoes.length !== 1 ? "ões" : ""} cadastrada{conversoes.length !== 1 ? "s" : ""}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Modal: Create unit ───────────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Nova Unidade de Medida</h3>
              <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Sigla *</Label>
                <Input
                  value={createForm.sigla}
                  onChange={(e) => setCreateForm((p) => ({ ...p, sigla: e.target.value.toUpperCase() }))}
                  placeholder="KG"
                  className="font-mono"
                  autoFocus
                  maxLength={10}
                  onKeyDown={(e) => e.key === "Enter" && createUnit()}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Nome *</Label>
                <Input
                  value={createForm.nome}
                  onChange={(e) => setCreateForm((p) => ({ ...p, nome: e.target.value }))}
                  placeholder="Quilograma"
                  onKeyDown={(e) => e.key === "Enter" && createUnit()}
                />
              </div>
            </div>
            {createError && <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{createError}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)} disabled={createSaving}>Cancelar</Button>
              <Button size="sm" onClick={createUnit} disabled={createSaving || !createForm.sigla.trim() || !createForm.nome.trim()}>
                {createSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Edit unit ────────────────────────────────────────────────── */}
      {editUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Editar Unidade</h3>
              <button onClick={() => setEditUnit(null)} className="text-muted-foreground hover:text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Sigla *</Label>
                <Input
                  value={editForm.sigla}
                  onChange={(e) => setEditForm((p) => ({ ...p, sigla: e.target.value.toUpperCase() }))}
                  className="font-mono"
                  autoFocus
                  maxLength={10}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Nome *</Label>
                <Input
                  value={editForm.nome}
                  onChange={(e) => setEditForm((p) => ({ ...p, nome: e.target.value }))}
                />
              </div>
            </div>
            {editError && <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{editError}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setEditUnit(null)} disabled={editSaving}>Cancelar</Button>
              <Button size="sm" onClick={saveEditUnit} disabled={editSaving || !editForm.sigla.trim() || !editForm.nome.trim()}>
                {editSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Delete unit ──────────────────────────────────────────────── */}
      {deleteUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-danger/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-danger" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Excluir unidade?</p>
                <p className="text-sm text-muted-foreground font-mono mt-0.5">{deleteUnit.sigla} — {deleteUnit.nome}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Esta ação é permanente. Conversões vinculadas também serão removidas.</p>
            {deleteError && <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 mb-4">{deleteError}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteUnit(null)} disabled={deleteLoading}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={confirmDeleteUnit} disabled={deleteLoading}>
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Delete conversion ────────────────────────────────────────── */}
      {deleteConvId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-danger/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-danger" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Remover conversão?</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {(() => {
                    const c = conversoes.find(x => x.id === deleteConvId);
                    return c ? `1 ${selected?.sigla} = ${toNum(c.fator)} ${c.unidadeDestino.sigla}` : "";
                  })()}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Esta ação é permanente e não pode ser desfeita.</p>
            {deleteConvError && <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 mb-4">{deleteConvError}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteConvId(null)} disabled={deleteConvLoading}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={confirmDeleteConv} disabled={deleteConvLoading}>
                {deleteConvLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                Remover
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
