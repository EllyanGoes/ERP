"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { MapPin, Package, Plus, Pencil, Trash2, Loader2, AlertTriangle, X, Check, Save, Building2, GitBranch } from "lucide-react";
import { formatBRL, cn } from "@/lib/utils";
import type { CategoriaEstoque } from "@prisma/client";
import { CATEGORIA_ESTOQUE_VALUES, CATEGORIA_ESTOQUE_LABELS, CATEGORIA_ESTOQUE_DESCRICOES } from "@/lib/categoria-estoque-ui";

type Filial = { id: string; razaoSocial: string; nomeFantasia: string | null };

type LocalRow = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  filialId: string | null;
  filial: { id: string; razaoSocial: string } | null;
  categoriasAceitas: CategoriaEstoque[];
  _count: { estoqueItens: number };
  // Custo total = saldo contábil do local (conta 1.1.3.x). null = local sem conta.
  custoContabil: number | null;
  estoqueItens: Array<{
    quantidadeAtual: unknown;
    item: { precoCusto: unknown } | null;
  }>;
};

// Multi-seleção de categorias aceitas pelo local. Vazio = aceita qualquer produto.
function CategoriasPicker({
  value,
  onChange,
}: {
  value: CategoriaEstoque[];
  onChange: (next: CategoriaEstoque[]) => void;
}) {
  function toggle(cat: CategoriaEstoque) {
    onChange(value.includes(cat) ? value.filter((c) => c !== cat) : [...value, cat]);
  }
  return (
    <div className="space-y-1.5">
      <div className="space-y-1.5 rounded-lg border border-border p-2.5 max-h-52 overflow-auto">
        {CATEGORIA_ESTOQUE_VALUES.map((cat) => (
          <label key={cat} className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={value.includes(cat)}
              onChange={() => toggle(cat)}
              className="mt-0.5 rounded border-border"
            />
            <span className="leading-tight">
              <span className="text-sm font-medium text-foreground">{CATEGORIA_ESTOQUE_LABELS[cat]}</span>
              <span className="block text-[11px] text-muted-foreground">{CATEGORIA_ESTOQUE_DESCRICOES[cat]}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {value.length === 0
          ? "Nenhuma marcada → o local aceita qualquer produto."
          : "Só produtos das categorias marcadas poderão entrar neste local."}
      </p>
    </div>
  );
}

function toNum(v: unknown) {
  if (v == null) return 0;
  return parseFloat(String(v));
}

export default function LocaisEstoquePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filialFiltro = searchParams.get("filialId") ?? "";

  const [locais, setLocais] = useState<LocalRow[]>([]);
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [loading, setLoading] = useState(true);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<{ nome: string; descricao: string; filialId: string; categoriasAceitas: CategoriaEstoque[] }>({ nome: "", descricao: "", filialId: "", categoriasAceitas: [] });
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState("");

  // Edit modal
  const [editItem, setEditItem] = useState<LocalRow | null>(null);
  const [editForm, setEditForm] = useState<{ nome: string; descricao: string; ativo: boolean; filialId: string; categoriasAceitas: CategoriaEstoque[] }>({ nome: "", descricao: "", ativo: true, filialId: "", categoriasAceitas: [] });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // Delete modal
  const [deleteItem, setDeleteItem] = useState<LocalRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filialFiltro) params.set("filialId", filialFiltro);
    const res = await fetch(`/api/suprimentos/locais-estoque?${params}`);
    const json = await res.json();
    setLocais(Array.isArray(json) ? json : []);
    setLoading(false);
  }, [filialFiltro]);

  useEffect(() => {
    load();
    fetch("/api/empresa/filiais?ativo=true")
      .then((r) => r.json())
      .then((j) => setFiliais(Array.isArray(j) ? j : []));
  }, [load]);

  function openCreate() {
    setCreateForm({ nome: "", descricao: "", filialId: "", categoriasAceitas: [] });
    setCreateError("");
    setShowCreate(true);
  }

  async function saveCreate() {
    if (!createForm.nome.trim()) return;
    setCreateSaving(true); setCreateError("");
    const res = await fetch("/api/suprimentos/locais-estoque", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome:     createForm.nome.trim(),
        descricao: createForm.descricao.trim() || undefined,
        filialId: createForm.filialId || null,
        categoriasAceitas: createForm.categoriasAceitas,
      }),
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
    setEditForm({ nome: item.nome, descricao: item.descricao ?? "", ativo: item.ativo, filialId: item.filialId ?? "", categoriasAceitas: item.categoriasAceitas ?? [] });
    setEditError("");
  }

  async function saveEdit() {
    if (!editItem) return;
    setEditSaving(true); setEditError("");
    const res = await fetch(`/api/suprimentos/locais-estoque/${editItem.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome:     editForm.nome.trim(),
        descricao: editForm.descricao.trim() || undefined,
        ativo:    editForm.ativo,
        filialId: editForm.filialId || null,
        categoriasAceitas: editForm.categoriasAceitas,
      }),
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

  const filialAtiva = filialFiltro ? filiais.find((f) => f.id === filialFiltro) : null;

  const totalProdutos = locais.reduce((s, l) => s + l._count.estoqueItens, 0);
  // Custo total geral = soma dos saldos CONTÁBEIS dos locais (reflete o razão).
  const custoTotalGeral = locais.reduce((sum, local) => sum + (local.custoContabil ?? 0), 0);

  const filialNome = (f: Filial | null | undefined) =>
    f ? (f.nomeFantasia || f.razaoSocial) : null;

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
        {/* Filial filter banner */}
        {filialFiltro && (
          <div className="flex items-center gap-3 px-4 py-3 bg-info/10 border border-info/30 rounded-xl text-sm">
            <GitBranch className="w-4 h-4 text-blue-500 shrink-0" />
            <span className="text-info font-medium">
              Filtrando por filial:{" "}
              <span className="font-semibold">
                {filialAtiva ? (filialAtiva.nomeFantasia || filialAtiva.razaoSocial) : filialFiltro}
              </span>
            </span>
            <Link
              href="/suprimentos/locais-estoque"
              className="ml-auto text-blue-500 hover:text-info underline text-xs"
            >
              Ver todos
            </Link>
          </div>
        )}

        {/* Summary */}
        <div className="inline-flex items-stretch rounded-xl border border-border bg-card shadow-sm divide-x divide-border overflow-hidden">
          <div className="px-5 py-3">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Locais</p>
            <p className="text-2xl font-bold text-success mt-0.5 tabular-nums">{locais.length}</p>
          </div>
          <div className="px-5 py-3">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Produtos alocados</p>
            <p className="text-2xl font-bold text-info mt-0.5 tabular-nums">{totalProdutos}</p>
          </div>
          <div className="px-5 py-3">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Custo Total Estoque</p>
            <p className="text-lg font-bold text-violet-700 dark:text-violet-300 mt-0.5 tabular-nums leading-tight">
              {locais.length > 0 ? formatBRL(custoTotalGeral) : <span className="text-muted-foreground/60">—</span>}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : locais.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
            <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum local cadastrado</p>
            <p className="text-sm mt-1">Clique em &quot;Novo Local&quot; para começar.</p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr className="text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-semibold">Local</th>
                  <th className="text-left px-4 py-3 font-semibold">Filial</th>
                  <th className="text-left px-4 py-3 font-semibold">Descrição</th>
                  <th className="text-center px-4 py-3 font-semibold">Produtos</th>
                  <th className="text-right px-4 py-3 font-semibold">Custo Total</th>
                  <th className="text-center px-4 py-3 font-semibold">Status</th>
                  <th className="text-center px-4 py-3 font-semibold w-20">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {locais.map((local) => {
                  const custoTotal = local.custoContabil;
                  return (
                    <tr
                      key={local.id}
                      className="hover:bg-muted transition-colors cursor-pointer"
                      onClick={() => router.push(`/suprimentos/locais-estoque/${local.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-emerald-500 shrink-0" />
                          <span className="font-medium text-foreground">{local.nome}</span>
                        </div>
                        {local.categoriasAceitas?.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1 pl-6">
                            {local.categoriasAceitas.map((c) => (
                              <span key={c} className="inline-flex items-center rounded-full bg-indigo-50 dark:bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-300 border border-indigo-100">
                                {CATEGORIA_ESTOQUE_LABELS[c]}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {local.filial ? (
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <span className="text-foreground text-xs">{local.filial.razaoSocial}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/60 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{local.descricao || "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 text-foreground">
                          <Package className="w-3.5 h-3.5 text-muted-foreground" />
                          {local._count.estoqueItens}
                        </span>
                      </td>
                      <td className={cn("px-4 py-3 text-right font-semibold", custoTotal != null && custoTotal < 0 ? "text-danger" : "text-violet-700 dark:text-violet-300")}>
                        {custoTotal != null ? formatBRL(custoTotal) : <span className="text-muted-foreground/60 font-normal">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${local.ativo ? "bg-success/15 text-success border-success/30" : "bg-muted text-muted-foreground border-border"}`}>
                          {local.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={(e) => openEdit(local, e)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-info hover:bg-info/10 transition-colors"
                            title="Editar"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => openDelete(local, e)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors"
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
          <div className="bg-card rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-success/15 flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-success" />
                </div>
                <h3 className="font-semibold text-foreground">Novo Local de Estoque</h3>
              </div>
              <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Nome <span className="text-red-500">*</span></Label>
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
                <Label>Filial</Label>
                <ComboboxWithCreate
                  value={createForm.filialId}
                  onChange={(v) => setCreateForm((p) => ({ ...p, filialId: v }))}
                  noneLabel="Sem filial"
                  triggerClassName="mt-1 h-9 rounded-lg"
                  options={filiais.map((f) => ({ value: f.id, label: filialNome(f) ?? f.razaoSocial }))}
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
              <div>
                <Label>Categorias aceitas</Label>
                <div className="mt-1">
                  <CategoriasPicker
                    value={createForm.categoriasAceitas}
                    onChange={(next) => setCreateForm((p) => ({ ...p, categoriasAceitas: next }))}
                  />
                </div>
              </div>
            </div>
            {createError && (
              <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{createError}</p>
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
          <div className="bg-card rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Editar Local de Estoque</h3>
              <button onClick={() => setEditItem(null)} className="text-muted-foreground hover:text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Nome <span className="text-red-500">*</span></Label>
                <Input
                  value={editForm.nome}
                  onChange={(e) => setEditForm((p) => ({ ...p, nome: e.target.value }))}
                  className="mt-1"
                  autoFocus
                />
              </div>
              <div>
                <Label>Filial</Label>
                <ComboboxWithCreate
                  value={editForm.filialId}
                  onChange={(v) => setEditForm((p) => ({ ...p, filialId: v }))}
                  noneLabel="Sem filial"
                  triggerClassName="mt-1 h-9 rounded-lg"
                  options={filiais.map((f) => ({ value: f.id, label: filialNome(f) ?? f.razaoSocial }))}
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
              <div>
                <Label>Categorias aceitas</Label>
                <div className="mt-1">
                  <CategoriasPicker
                    value={editForm.categoriasAceitas}
                    onChange={(next) => setEditForm((p) => ({ ...p, categoriasAceitas: next }))}
                  />
                </div>
              </div>
            </div>
            {editError && (
              <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{editError}</p>
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
          <div className="bg-card rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-danger/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-danger" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Excluir local?</p>
                <p className="text-sm text-muted-foreground mt-0.5">{deleteItem.nome}</p>
              </div>
            </div>
            {deleteItem._count.estoqueItens > 0 && (
              <p className="text-sm text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2 mb-3">
                Este local possui {deleteItem._count.estoqueItens} produto(s) em estoque.
              </p>
            )}
            <p className="text-sm text-muted-foreground mb-4">Esta ação é permanente e não pode ser desfeita.</p>
            {deleteError && (
              <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 mb-4">{deleteError}</p>
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
