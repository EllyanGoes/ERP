"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  MapPin, Package, AlertTriangle, ChevronRight, ArrowLeft,
  Pencil, Trash2, Save, X, Loader2, Plus, Hash, CheckCircle2, Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTabTitle } from "@/lib/tabs-context";
import { cn, formatBRL } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
type EstoqueItem = {
  id: string;
  quantidadeAtual: unknown;
  quantidadeMin: unknown;
  quantidadeMax: unknown | null;
  localizacao: string | null;
  item: {
    id: string;
    codigo: string;
    descricao: string;
    tipo: string;
    ativo: boolean;
    unidadeMedida: string;
    precoCusto: unknown;
    unidade: { sigla: string } | null;
  };
};

type Endereco = {
  id: string;
  codigo: string;
  descricao: string | null;
  ativo: boolean;
};

type Filial = { id: string; razaoSocial: string; nomeFantasia: string | null };

type Local = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  filialId: string | null;
  filial: Filial | null;
  estoqueItens: EstoqueItem[];
};

function toNum(v: unknown) {
  if (v == null) return 0;
  return parseFloat(String(v));
}

const TABS = [
  { key: "estoque",   label: "Estoque" },
  { key: "enderecos", label: "Endereçamentos" },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function LocalEstoqueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [local, setLocal]   = useState<Local | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("estoque");

  // ── Local edit ───────────────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [form, setForm]         = useState({ nome: "", descricao: "", ativo: true, filialId: "" });
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState("");
  const [filiais, setFiliais]   = useState<Filial[]>([]);

  // ── Local delete ─────────────────────────────────────────────────────────────
  const [showDelete, setShowDelete]   = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // ── Endereços state ──────────────────────────────────────────────────────────
  const [enderecos, setEnderecos]         = useState<Endereco[]>([]);
  const [endLoading, setEndLoading]       = useState(false);
  const [endLoaded, setEndLoaded]         = useState(false);

  // Add form (inline at top of list)
  const [showAddEnd, setShowAddEnd]       = useState(false);
  const [addForm, setAddForm]             = useState({ codigo: "", descricao: "" });
  const [addSaving, setAddSaving]         = useState(false);
  const [addError, setAddError]           = useState("");

  // Edit row
  const [editEndId, setEditEndId]         = useState<string | null>(null);
  const [editEndForm, setEditEndForm]     = useState({ codigo: "", descricao: "", ativo: true });
  const [editEndSaving, setEditEndSaving] = useState(false);
  const [editEndError, setEditEndError]   = useState("");

  // Delete confirm
  const [deleteEndId, setDeleteEndId]     = useState<string | null>(null);
  const [deleteEndLoading, setDeleteEndLoading] = useState(false);
  const [deleteEndError, setDeleteEndError] = useState("");

  // ── Load local ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/suprimentos/locais-estoque/${id}`);
    if (!res.ok) { setLoading(false); return; }
    const data: Local = await res.json();
    setLocal(data);
    setForm({ nome: data.nome, descricao: data.descricao ?? "", ativo: data.ativo, filialId: data.filialId ?? "" });
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ── Load endereços (lazy — only when tab is opened) ──────────────────────────
  const loadEnderecos = useCallback(async () => {
    setEndLoading(true);
    const res  = await fetch(`/api/suprimentos/locais-estoque/${id}/enderecos`);
    const data = await res.json();
    setEnderecos(Array.isArray(data) ? data : []);
    setEndLoaded(true);
    setEndLoading(false);
  }, [id]);

  function handleTabClick(key: string) {
    setActiveTab(key);
    if (key === "enderecos" && !endLoaded) loadEnderecos();
  }

  // Load filiais when entering edit mode
  useEffect(() => {
    if (!editMode || filiais.length > 0) return;
    fetch("/api/empresa/filiais?ativo=true")
      .then((r) => r.json())
      .then((d) => setFiliais(Array.isArray(d) ? d : []));
  }, [editMode]); // eslint-disable-line

  // ── Local save ───────────────────────────────────────────────────────────────
  async function saveEdit() {
    if (!local) return;
    setSaving(true); setSaveError("");
    const res = await fetch(`/api/suprimentos/locais-estoque/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome:     form.nome.trim(),
        descricao: form.descricao.trim() || null,
        ativo:    form.ativo,
        filialId: form.filialId || null,
      }),
    });
    if (!res.ok) { setSaveError((await res.json()).error || "Erro ao salvar"); setSaving(false); return; }
    await load(); setEditMode(false); setSaving(false);
  }

  async function handleDelete() {
    setDeleteLoading(true); setDeleteError("");
    const res = await fetch(`/api/suprimentos/locais-estoque/${id}`, { method: "DELETE" });
    if (!res.ok) { setDeleteError((await res.json()).error || "Erro ao excluir"); setDeleteLoading(false); return; }
    router.push("/suprimentos/locais-estoque");
  }

  // ── Endereço: add ────────────────────────────────────────────────────────────
  async function addEndereco() {
    if (!addForm.codigo.trim()) return;
    setAddSaving(true); setAddError("");
    const res = await fetch(`/api/suprimentos/locais-estoque/${id}/enderecos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: addForm.codigo.trim(), descricao: addForm.descricao.trim() || null }),
    });
    if (!res.ok) { setAddError((await res.json()).error || "Erro ao salvar"); setAddSaving(false); return; }
    setAddForm({ codigo: "", descricao: "" });
    setShowAddEnd(false);
    await loadEnderecos();
    setAddSaving(false);
  }

  // ── Endereço: edit ───────────────────────────────────────────────────────────
  function openEditEnd(e: Endereco) {
    setEditEndId(e.id);
    setEditEndForm({ codigo: e.codigo, descricao: e.descricao ?? "", ativo: e.ativo });
    setEditEndError("");
  }

  async function saveEditEnd() {
    if (!editEndId) return;
    setEditEndSaving(true); setEditEndError("");
    const res = await fetch(`/api/suprimentos/locais-estoque/${id}/enderecos/${editEndId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: editEndForm.codigo.trim(), descricao: editEndForm.descricao.trim() || null, ativo: editEndForm.ativo }),
    });
    if (!res.ok) { setEditEndError((await res.json()).error || "Erro ao salvar"); setEditEndSaving(false); return; }
    setEditEndId(null);
    await loadEnderecos();
    setEditEndSaving(false);
  }

  // ── Endereço: delete ─────────────────────────────────────────────────────────
  async function confirmDeleteEnd() {
    if (!deleteEndId) return;
    setDeleteEndLoading(true); setDeleteEndError("");
    const res = await fetch(`/api/suprimentos/locais-estoque/${id}/enderecos/${deleteEndId}`, { method: "DELETE" });
    if (!res.ok) { setDeleteEndError((await res.json()).error || "Erro ao excluir"); setDeleteEndLoading(false); return; }
    setDeleteEndId(null);
    await loadEnderecos();
    setDeleteEndLoading(false);
  }

  // ── Tab title ────────────────────────────────────────────────────────────────
  useTabTitle(local?.nome ?? null);

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  );
  if (!local) return <div className="px-8 pt-8 text-red-500">Local não encontrado</div>;

  const custoTotal = local.estoqueItens.reduce((s, e) => {
    return s + toNum(e.item.precoCusto) * toNum(e.quantidadeAtual);
  }, 0);
  const abaixoMinimo = local.estoqueItens.filter(
    (e) => toNum(e.quantidadeMin) > 0 && toNum(e.quantidadeAtual) < toNum(e.quantidadeMin)
  ).length;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 px-8 pt-6 pb-2 text-sm text-gray-500">
        <Link href="/suprimentos/locais-estoque" className="hover:text-gray-800 transition-colors flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          Locais de Estoque
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
        <span className="text-gray-800 font-medium">{local.nome}</span>
      </div>

      {/* Header */}
      <div className="px-8 py-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5 text-emerald-600" />
          </div>
          {editMode ? (
            <div className="space-y-2 flex-1">
              <Input value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} className="text-lg font-semibold h-9 w-72" autoFocus />
              <Input value={form.descricao} onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} placeholder="Descrição (opcional)" className="h-8 text-sm w-72" />
              {/* Filial select */}
              <div className="w-72">
                <Label className="text-xs text-gray-500 mb-1 block">Filial</Label>
                <select
                  value={form.filialId}
                  onChange={(e) => setForm((p) => ({ ...p, filialId: e.target.value }))}
                  className="w-full h-8 px-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <option value="">Sem filial vinculada</option>
                  {filiais.map((f) => (
                    <option key={f.id} value={f.id}>{f.nomeFantasia || f.razaoSocial}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="ativo" checked={form.ativo} onChange={(e) => setForm((p) => ({ ...p, ativo: e.target.checked }))} className="rounded" />
                <Label htmlFor="ativo" className="text-sm cursor-pointer">Ativo</Label>
              </div>
              {saveError && <p className="text-xs text-red-600">{saveError}</p>}
            </div>
          ) : (
            <div>
              <h1 className="text-xl font-bold text-gray-900">{local.nome}</h1>
              {local.descricao && <p className="text-sm text-gray-500 mt-0.5">{local.descricao}</p>}
              {local.filial && (
                <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400" />
                  {local.filial.nomeFantasia || local.filial.razaoSocial}
                </p>
              )}
            </div>
          )}
          <span className={`ml-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${local.ativo ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
            {local.ativo ? "Ativo" : "Inativo"}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {editMode ? (
            <>
              <Button size="sm" onClick={saveEdit} disabled={saving || !form.nome.trim()}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}Salvar
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setEditMode(false); setSaveError(""); setForm({ nome: local.nome, descricao: local.descricao ?? "", ativo: local.ativo, filialId: local.filialId ?? "" }); }}>
                <X className="w-4 h-4 mr-1" />Cancelar
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditMode(true)}>
                <Pencil className="w-4 h-4 mr-1" />Editar
              </Button>
              <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200" onClick={() => setShowDelete(true)}>
                <Trash2 className="w-4 h-4 mr-1" />Excluir
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="px-8 pb-8 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4 max-w-lg">
          <div className="rounded-xl bg-blue-50 px-4 py-3">
            <p className="text-xs text-blue-600 font-medium">Produtos</p>
            <p className="text-2xl font-bold text-blue-800 mt-0.5">{local.estoqueItens.length}</p>
          </div>
          <div className="rounded-xl bg-violet-50 px-4 py-3">
            <p className="text-xs text-violet-600 font-medium">Custo Total</p>
            <p className="text-xl font-bold text-violet-800 mt-0.5">{custoTotal > 0 ? formatBRL(custoTotal) : "—"}</p>
          </div>
          {abaixoMinimo > 0 && (
            <div className="rounded-xl bg-red-50 px-4 py-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
              <div>
                <p className="text-xs text-red-600 font-medium">Abaixo do mínimo</p>
                <p className="text-2xl font-bold text-red-700 mt-0.5">{abaixoMinimo}</p>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => handleTabClick(t.key)}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                  activeTab === t.key
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Tab: Estoque ───────────────────────────────────────────────────── */}
        {activeTab === "estoque" && (
          local.estoqueItens.length === 0 ? (
            <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhum produto neste local</p>
              <p className="text-sm mt-1">O estoque é alimentado ao registrar movimentações de entrada.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-xs text-gray-400 uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5 font-medium">Código</th>
                    <th className="text-left px-4 py-2.5 font-medium">Descrição</th>
                    <th className="text-left px-4 py-2.5 font-medium">Endereço</th>
                    <th className="text-right px-4 py-2.5 font-medium">Qtd. Atual</th>
                    <th className="text-right px-4 py-2.5 font-medium">Mínimo</th>
                    <th className="text-right px-4 py-2.5 font-medium">Máximo</th>
                    <th className="text-right px-4 py-2.5 font-medium">Custo Total</th>
                    <th className="text-center px-4 py-2.5 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {local.estoqueItens.map((e) => {
                    const atual   = toNum(e.quantidadeAtual);
                    const min     = toNum(e.quantidadeMin);
                    const max     = e.quantidadeMax ? toNum(e.quantidadeMax) : null;
                    const abaixo  = min > 0 && atual < min;
                    const acima   = max !== null && atual > max;
                    const unidade = e.item.unidade?.sigla || e.item.unidadeMedida;
                    const itemCusto = toNum(e.item.precoCusto) * atual;
                    return (
                      <tr key={e.id} className={cn("hover:bg-gray-50 transition-colors", abaixo && "bg-red-50/40 hover:bg-red-50/60", !e.item.ativo && "opacity-50")}>
                        <td className="px-4 py-3">
                          <Link href={`/suprimentos/produtos/${e.item.id}`} className="font-mono text-xs text-blue-600 hover:underline">
                            {e.item.codigo}
                          </Link>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{e.item.descricao}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {e.localizacao
                            ? <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{e.localizacao}</span>
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn("font-bold text-base", abaixo ? "text-red-600" : "text-gray-900")}>
                            {atual.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                          </span>
                          <span className="text-xs text-gray-400 ml-1">{unidade}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500 text-sm">{min > 0 ? min.toLocaleString("pt-BR") : "—"}</td>
                        <td className="px-4 py-3 text-right text-gray-500 text-sm">{max !== null ? max.toLocaleString("pt-BR") : "—"}</td>
                        <td className="px-4 py-3 text-right font-semibold text-violet-700">
                          {itemCusto > 0 ? formatBRL(itemCusto) : <span className="text-gray-300 font-normal">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {abaixo ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="w-3 h-3" />Baixo
                            </span>
                          ) : acima ? (
                            <span className="text-xs font-medium text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">Acima máx.</span>
                          ) : (
                            <span className="text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">Normal</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {local.estoqueItens.length > 1 && (
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-gray-50">
                      <td colSpan={6} className="px-4 py-2 text-xs font-medium text-gray-500">Total</td>
                      <td className="px-4 py-2 text-right font-bold text-violet-700">
                        {custoTotal > 0 ? formatBRL(custoTotal) : "—"}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )
        )}

        {/* ── Tab: Endereçamentos ────────────────────────────────────────────── */}
        {activeTab === "enderecos" && (
          <div className="space-y-4">
            {/* Header bar */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Endereços físicos de armazenagem dentro deste local (ex: A-01-01, B-02-03).
              </p>
              {!showAddEnd && (
                <Button size="sm" onClick={() => { setShowAddEnd(true); setAddForm({ codigo: "", descricao: "" }); setAddError(""); }}>
                  <Plus className="w-4 h-4 mr-1" />
                  Novo Endereço
                </Button>
              )}
            </div>

            {/* Inline add form */}
            {showAddEnd && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
                <p className="text-sm font-medium text-blue-800">Novo Endereço</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Código *</Label>
                    <Input
                      value={addForm.codigo}
                      onChange={(e) => setAddForm((p) => ({ ...p, codigo: e.target.value.toUpperCase() }))}
                      placeholder="Ex: A-01-01"
                      className="h-8 text-sm font-mono"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") addEndereco(); if (e.key === "Escape") setShowAddEnd(false); }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Descrição</Label>
                    <Input
                      value={addForm.descricao}
                      onChange={(e) => setAddForm((p) => ({ ...p, descricao: e.target.value }))}
                      placeholder="Opcional"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                {addError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{addError}</p>}
                <div className="flex gap-2">
                  <Button size="sm" onClick={addEndereco} disabled={addSaving || !addForm.codigo.trim()}>
                    {addSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                    Adicionar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowAddEnd(false)} disabled={addSaving}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {/* List */}
            {endLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : enderecos.length === 0 ? (
              <div className="text-center py-14 text-gray-400 border border-dashed border-gray-200 rounded-xl">
                <Hash className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="font-medium text-sm">Nenhum endereço cadastrado</p>
                <p className="text-xs mt-1">Clique em &quot;Novo Endereço&quot; para começar.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr className="text-xs text-gray-400 uppercase tracking-wide">
                      <th className="text-left px-4 py-2.5 font-medium">Código</th>
                      <th className="text-left px-4 py-2.5 font-medium">Descrição</th>
                      <th className="text-center px-4 py-2.5 font-medium">Status</th>
                      <th className="w-24" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {enderecos.map((end) => (
                      <tr key={end.id} className={cn("hover:bg-gray-50 transition-colors", !end.ativo && "opacity-50")}>
                        {editEndId === end.id ? (
                          /* ── Inline edit row ── */
                          <>
                            <td className="px-4 py-2">
                              <Input
                                value={editEndForm.codigo}
                                onChange={(e) => setEditEndForm((p) => ({ ...p, codigo: e.target.value.toUpperCase() }))}
                                className="h-7 text-sm font-mono w-32"
                                autoFocus
                              />
                            </td>
                            <td className="px-4 py-2">
                              <Input
                                value={editEndForm.descricao}
                                onChange={(e) => setEditEndForm((p) => ({ ...p, descricao: e.target.value }))}
                                placeholder="Descrição"
                                className="h-7 text-sm"
                              />
                            </td>
                            <td className="px-4 py-2 text-center">
                              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editEndForm.ativo}
                                  onChange={(e) => setEditEndForm((p) => ({ ...p, ativo: e.target.checked }))}
                                  className="rounded"
                                />
                                <span className="text-xs text-gray-600">Ativo</span>
                              </label>
                            </td>
                            <td className="px-4 py-2">
                              {editEndError && <p className="text-xs text-red-600 mb-1">{editEndError}</p>}
                              <div className="flex items-center gap-1 justify-end">
                                <Button size="sm" className="h-7 px-2 text-xs" onClick={saveEditEnd} disabled={editEndSaving || !editEndForm.codigo.trim()}>
                                  {editEndSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setEditEndId(null)} disabled={editEndSaving}>
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            </td>
                          </>
                        ) : (
                          /* ── Normal row ── */
                          <>
                            <td className="px-4 py-3">
                              <span className="font-mono text-sm font-semibold text-gray-800">{end.codigo}</span>
                            </td>
                            <td className="px-4 py-3 text-gray-500 text-sm">
                              {end.descricao || <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {end.ativo
                                ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                                    <CheckCircle2 className="w-3 h-3" />Ativo
                                  </span>
                                : <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                    <Circle className="w-3 h-3" />Inativo
                                  </span>
                              }
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => openEditEnd(end)}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                  title="Editar"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => { setDeleteEndId(end.id); setDeleteEndError(""); }}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                  title="Excluir"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
                  {enderecos.length} endereço{enderecos.length !== 1 ? "s" : ""} · {enderecos.filter(e => e.ativo).length} ativo{enderecos.filter(e => e.ativo).length !== 1 ? "s" : ""}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Delete local confirm ──────────────────────────────────────────────── */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Excluir local?</p>
                <p className="text-sm text-gray-500 mt-0.5">{local.nome}</p>
              </div>
            </div>
            {local.estoqueItens.length > 0 && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                Este local possui {local.estoqueItens.length} produto(s) vinculado(s).
              </p>
            )}
            <p className="text-sm text-gray-600 mb-4">Esta ação é permanente e não pode ser desfeita.</p>
            {deleteError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{deleteError}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowDelete(false)} disabled={deleteLoading}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleteLoading}>
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete endereço confirm ───────────────────────────────────────────── */}
      {deleteEndId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Excluir endereço?</p>
                <p className="text-sm text-gray-500 mt-0.5 font-mono">
                  {enderecos.find(e => e.id === deleteEndId)?.codigo}
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">Esta ação é permanente e não pode ser desfeita.</p>
            {deleteEndError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{deleteEndError}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteEndId(null)} disabled={deleteEndLoading}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={confirmDeleteEnd} disabled={deleteEndLoading}>
                {deleteEndLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
