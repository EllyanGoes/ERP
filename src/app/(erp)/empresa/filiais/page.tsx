"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  GitBranch, Plus, Pencil, Trash2, Loader2, AlertTriangle,
  X, Save, Check, Search, MapPin,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useColumnOrder } from "@/lib/use-column-order";
import { useColumnVisibility } from "@/lib/use-column-visibility";
import ColumnConfigurator, { ColDef } from "@/components/shared/ColumnConfigurator";

// ── Types ─────────────────────────────────────────────────────────────────────

type Filial = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string | null;
  ie: string | null;
  email: string | null;
  telefone: string | null;
  celular: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  ativo: boolean;
  matriz?: boolean;
  _count: { locaisEstoque: number };
};

type Form = {
  razaoSocial: string; nomeFantasia: string; cnpj: string; ie: string;
  email: string; telefone: string; celular: string;
  cep: string; logradouro: string; numero: string; complemento: string;
  bairro: string; cidade: string; estado: string; ativo: boolean;
};

const emptyForm: Form = {
  razaoSocial: "", nomeFantasia: "", cnpj: "", ie: "",
  email: "", telefone: "", celular: "",
  cep: "", logradouro: "", numero: "", complemento: "",
  bairro: "", cidade: "", estado: "", ativo: true,
};

// ── Column definitions ────────────────────────────────────────────────────────
const COLS: ColDef<Filial>[] = [
  {
    id: "razaoSocial",
    label: "Razão Social",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 font-medium text-gray-900",
    render: (f) => (
      <span className="inline-flex items-center gap-2">
        {f.razaoSocial}
        {f.matriz && (
          <span className="px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 text-[10px] font-medium" title="Espelho automático do cadastro da empresa — edite em Configurações → Empresas do Grupo">
            Matriz
          </span>
        )}
      </span>
    ),
  },
  {
    id: "nomeFantasia",
    label: "Nome Fantasia",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 text-gray-500",
    render: (f) => f.nomeFantasia || <span className="text-gray-300">—</span>,
  },
  {
    id: "cnpj",
    label: "CNPJ",
    thClass: "text-left px-4 py-3 font-medium text-gray-600 w-36",
    tdClass: "px-4 py-3 font-mono text-xs text-gray-600",
    render: (f) => f.cnpj || <span className="text-gray-300">—</span>,
  },
  {
    id: "endereco",
    label: "Endereço",
    thClass: "text-left px-4 py-3 font-medium text-gray-600 w-28",
    tdClass: "px-4 py-3 text-gray-500",
    render: (f) =>
      f.cidade || f.estado
        ? <span>{f.cidade}{f.cidade && f.estado ? " / " : ""}{f.estado}</span>
        : <span className="text-gray-300">—</span>,
  },
  {
    id: "telefone",
    label: "Telefone",
    thClass: "text-left px-4 py-3 font-medium text-gray-600 w-32",
    tdClass: "px-4 py-3 text-gray-500",
    render: (f) => f.telefone || <span className="text-gray-300">—</span>,
  },
  {
    id: "locais",
    label: "Locais",
    thClass: "text-center px-4 py-3 font-medium text-gray-600 w-20",
    tdClass: "px-4 py-3 text-center",
    render: (f) =>
      f._count.locaisEstoque > 0 ? (
        <Link
          href={`/suprimentos/locais-estoque?filialId=${f.id}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline text-xs font-medium"
          title="Ver locais de estoque desta filial"
        >
          <MapPin className="w-3.5 h-3.5" />
          {f._count.locaisEstoque}
        </Link>
      ) : (
        <span className="text-gray-300 text-xs">0</span>
      ),
  },
  {
    id: "ativo",
    label: "Ativo",
    thClass: "text-center px-4 py-3 font-medium text-gray-600 w-20",
    tdClass: "px-4 py-3 text-center",
    render: (f) => (
      <span className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        f.ativo ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
      )}>
        {f.ativo ? "Ativo" : "Inativo"}
      </span>
    ),
  },
];

// ── Field helper ──────────────────────────────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}{required && <span className="text-red-500 ml-0.5">*</span>}</Label>
      {children}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function FilialModal({
  title, form, setForm, onSave, onClose, saving, error, showAtivo,
}: {
  title: string;
  form: Form;
  setForm: React.Dispatch<React.SetStateAction<Form>>;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  error: string;
  showAtivo?: boolean;
}) {
  const set = (key: keyof Form, value: string | boolean) =>
    setForm((p) => ({ ...p, [key]: value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <GitBranch className="w-4 h-4 text-blue-600" />
            </div>
            <h3 className="font-semibold text-gray-900">{title}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 space-y-5">
          {/* Dados principais */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Dados da Filial</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field label="Razão Social" required>
                  <Input value={form.razaoSocial} onChange={(e) => set("razaoSocial", e.target.value)} autoFocus />
                </Field>
              </div>
              <Field label="Nome Fantasia">
                <Input value={form.nomeFantasia} onChange={(e) => set("nomeFantasia", e.target.value)} />
              </Field>
              <Field label="CNPJ">
                <Input value={form.cnpj} onChange={(e) => set("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
              </Field>
              <Field label="IE (Inscrição Estadual)">
                <Input value={form.ie} onChange={(e) => set("ie", e.target.value)} />
              </Field>
              <Field label="E-mail">
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="filial@empresa.com" />
              </Field>
              <Field label="Telefone">
                <Input value={form.telefone} onChange={(e) => set("telefone", e.target.value)} placeholder="(00) 0000-0000" />
              </Field>
              <Field label="Celular">
                <Input value={form.celular} onChange={(e) => set("celular", e.target.value)} placeholder="(00) 00000-0000" />
              </Field>
            </div>
          </div>

          {/* Endereço */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Endereço</p>
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-2">
                <Field label="CEP">
                  <Input value={form.cep} onChange={(e) => set("cep", e.target.value)} placeholder="00000-000" />
                </Field>
              </div>
              <div className="col-span-4">
                <Field label="Logradouro">
                  <Input value={form.logradouro} onChange={(e) => set("logradouro", e.target.value)} placeholder="Rua, Av, etc." />
                </Field>
              </div>
              <div className="col-span-1">
                <Field label="Número">
                  <Input value={form.numero} onChange={(e) => set("numero", e.target.value)} />
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="Complemento">
                  <Input value={form.complemento} onChange={(e) => set("complemento", e.target.value)} placeholder="Sala, Bloco..." />
                </Field>
              </div>
              <div className="col-span-3">
                <Field label="Bairro">
                  <Input value={form.bairro} onChange={(e) => set("bairro", e.target.value)} />
                </Field>
              </div>
              <div className="col-span-4">
                <Field label="Cidade">
                  <Input value={form.cidade} onChange={(e) => set("cidade", e.target.value)} />
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="Estado (UF)">
                  <Input value={form.estado} onChange={(e) => set("estado", e.target.value.toUpperCase())} maxLength={2} placeholder="SP" />
                </Field>
              </div>
            </div>
          </div>

          {showAtivo && (
            <div className="flex items-center gap-2 pt-1">
              <input
                id="ativo-modal"
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => set("ativo", e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="ativo-modal" className="cursor-pointer">Filial ativa</Label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={onSave} disabled={saving || !form.razaoSocial.trim()}>
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Salvando...</>
                : showAtivo
                ? <><Check className="w-4 h-4 mr-1" />Salvar</>
                : <><Save className="w-4 h-4 mr-1" />Adicionar</>
              }
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FiliaisPage() {
  const [filiais,  setFiliais]  = useState<Filial[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState<"" | "true" | "false">("");

  // Create
  const [showCreate, setShowCreate]   = useState(false);
  const [createForm, setCreateForm]   = useState<Form>(emptyForm);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError,  setCreateError]  = useState("");

  // Edit
  const [editItem,   setEditItem]   = useState<Filial | null>(null);
  const [editForm,   setEditForm]   = useState<Form>(emptyForm);
  const [editSaving, setEditSaving] = useState(false);
  const [editError,  setEditError]  = useState("");

  // Delete
  const [deleteItem,    setDeleteItem]    = useState<Filial | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError,   setDeleteError]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search)      params.set("search", search);
    if (filtroAtivo) params.set("ativo", filtroAtivo);
    const res  = await fetch(`/api/empresa/filiais?${params}`);
    const json = await res.json();
    setFiliais(Array.isArray(json) ? json : []);
    setLoading(false);
  }, [search, filtroAtivo]);

  useEffect(() => { load(); }, [load]);

  // ── Create ──────────────────────────────────────────────────────────────────
  function openCreate() { setCreateForm(emptyForm); setCreateError(""); setShowCreate(true); }
  async function saveCreate() {
    setCreateSaving(true); setCreateError("");
    const res = await fetch("/api/empresa/filiais", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...createForm, cnpj: createForm.cnpj || null }),
    });
    if (!res.ok) { setCreateError((await res.json()).error || "Erro ao salvar"); setCreateSaving(false); return; }
    setShowCreate(false); await load(); setCreateSaving(false);
  }

  // ── Edit ────────────────────────────────────────────────────────────────────
  function openEdit(f: Filial, e: React.MouseEvent) {
    e.stopPropagation();
    setEditItem(f);
    setEditForm({
      razaoSocial: f.razaoSocial, nomeFantasia: f.nomeFantasia ?? "",
      cnpj: f.cnpj ?? "", ie: f.ie ?? "", email: f.email ?? "",
      telefone: f.telefone ?? "", celular: f.celular ?? "",
      cep: f.cep ?? "", logradouro: f.logradouro ?? "", numero: f.numero ?? "",
      complemento: f.complemento ?? "", bairro: f.bairro ?? "",
      cidade: f.cidade ?? "", estado: f.estado ?? "", ativo: f.ativo,
    });
    setEditError("");
  }
  async function saveEdit() {
    if (!editItem) return;
    setEditSaving(true); setEditError("");
    const res = await fetch(`/api/empresa/filiais/${editItem.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...editForm, cnpj: editForm.cnpj || null }),
    });
    if (!res.ok) { setEditError((await res.json()).error || "Erro ao salvar"); setEditSaving(false); return; }
    setEditItem(null); await load(); setEditSaving(false);
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  function openDelete(f: Filial, e: React.MouseEvent) { e.stopPropagation(); setDeleteItem(f); setDeleteError(""); }
  async function confirmDelete() {
    if (!deleteItem) return;
    setDeleteLoading(true); setDeleteError("");
    const res = await fetch(`/api/empresa/filiais/${deleteItem.id}`, { method: "DELETE" });
    if (!res.ok) { setDeleteError((await res.json()).error || "Não foi possível excluir"); setDeleteLoading(false); return; }
    setDeleteItem(null); await load(); setDeleteLoading(false);
  }

  const ativos   = filiais.filter((f) => f.ativo).length;
  const inativos = filiais.filter((f) => !f.ativo).length;

  // Column order
  const [colOrder, setColOrder] = useColumnOrder("filiais", COLS.map((c) => c.id));
  const [colVis, setColVis, showAllCols] = useColumnVisibility("filiais", COLS.map((c) => c.id));
  const orderedCols = colOrder.map((id) => COLS.find((c) => c.id === id)).filter((c): c is ColDef<Filial> => c !== undefined && colVis[c.id] !== false);

  return (
    <div>
      <PageHeader
        title="Filiais"
        breadcrumbs={[{ label: "Empresa" }, { label: "Filiais" }]}
        action={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Filial
          </Button>
        }
      />

      <div className="px-8 pb-8 space-y-5">
        {/* Summary */}
        <div className="flex items-center gap-4">
          <div className="rounded-xl px-5 py-3 bg-blue-50 text-blue-700 flex items-center gap-3">
            <GitBranch className="w-5 h-5 opacity-60" />
            <div><p className="text-xs font-medium opacity-70">Total</p><p className="text-2xl font-bold leading-none mt-0.5">{filiais.length}</p></div>
          </div>
          <div className="rounded-xl px-5 py-3 bg-emerald-50 text-emerald-700 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <div><p className="text-xs font-medium opacity-70">Ativas</p><p className="text-2xl font-bold leading-none mt-0.5">{ativos}</p></div>
          </div>
          {inativos > 0 && (
            <div className="rounded-xl px-5 py-3 bg-gray-50 text-gray-500 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-gray-400" />
              <div><p className="text-xs font-medium opacity-70">Inativas</p><p className="text-2xl font-bold leading-none mt-0.5">{inativos}</p></div>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Razão social, nome fantasia, CNPJ..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <select
            value={filtroAtivo}
            onChange={(e) => setFiltroAtivo(e.target.value as "" | "true" | "false")}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-700"
          >
            <option value="">Todas</option>
            <option value="true">Ativas</option>
            <option value="false">Inativas</option>
          </select>
          <ColumnConfigurator columns={COLS} order={colOrder} onOrderChange={setColOrder} visibility={colVis} onVisibilityChange={setColVis} onShowAll={showAllCols} />
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : filiais.length === 0 ? (
          <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
            <GitBranch className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhuma filial encontrada</p>
            <p className="text-sm mt-1">Clique em &quot;Nova Filial&quot; para começar.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {orderedCols.map((col) => (
                    <th key={col.id} className={col.thClass}>{col.label}</th>
                  ))}
                  <th className="text-center px-4 py-3 font-medium text-gray-600 w-20">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filiais.map((f) => (
                  <tr key={f.id} className="hover:bg-gray-50/60 transition-colors">
                    {orderedCols.map((col) => (
                      <td key={col.id} className={col.tdClass}>{col.render(f)}</td>
                    ))}
                    <td className="px-4 py-3 text-center">
                      {f.matriz ? (
                        <span className="text-[11px] text-gray-400" title="A matriz é editada em Configurações → Empresas do Grupo">via Empresa</span>
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={(e) => openEdit(f, e)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Editar">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={(e) => openDelete(f, e)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Excluir">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <FilialModal
          title="Nova Filial"
          form={createForm} setForm={setCreateForm}
          onSave={saveCreate} onClose={() => setShowCreate(false)}
          saving={createSaving} error={createError}
        />
      )}

      {editItem && (
        <FilialModal
          title="Editar Filial"
          form={editForm} setForm={setEditForm}
          onSave={saveEdit} onClose={() => setEditItem(null)}
          saving={editSaving} error={editError}
          showAtivo
        />
      )}

      {deleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Excluir filial?</p>
                <p className="text-sm text-gray-500 mt-0.5">{deleteItem.razaoSocial}</p>
              </div>
            </div>
            {deleteItem._count.locaisEstoque > 0 && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                Esta filial possui {deleteItem._count.locaisEstoque} local(is) de estoque vinculado(s).
              </p>
            )}
            <p className="text-sm text-gray-600 mb-4">Esta ação é permanente e não pode ser desfeita.</p>
            {deleteError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{deleteError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteItem(null)} disabled={deleteLoading}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={confirmDelete} disabled={deleteLoading}>
                {deleteLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Excluindo...</> : <><Trash2 className="w-4 h-4 mr-1" />Excluir</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
