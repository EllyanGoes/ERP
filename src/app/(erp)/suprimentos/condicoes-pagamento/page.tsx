"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Pencil, Check, ToggleLeft, ToggleRight, Loader2, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Condicao {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
}

const empty = (): Omit<Condicao, "id" | "ativo"> => ({
  nome: "",
  descricao: "",
});

export default function CondicoesPagamentoPage() {
  const [rows, setRows] = useState<Condicao[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(empty());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/suprimentos/condicoes-pagamento");
    setRows(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const startNew = () => { setForm(empty()); setEditingId("new"); setError(null); };
  const startEdit = (r: Condicao) => {
    setForm({ nome: r.nome, descricao: r.descricao ?? "" });
    setEditingId(r.id); setError(null);
  };
  const cancel = () => { setEditingId(null); setError(null); };

  const save = async () => {
    setSaving(true); setError(null);
    const url = editingId === "new"
      ? "/api/suprimentos/condicoes-pagamento"
      : `/api/suprimentos/condicoes-pagamento/${editingId}`;
    const method = editingId === "new" ? "POST" : "PATCH";
    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    if (!res.ok) { setError((await res.json()).error ?? "Erro ao salvar"); setSaving(false); return; }
    setEditingId(null); await load(); setSaving(false);
  };

  const toggleAtivo = async (r: Condicao) => {
    await fetch(`/api/suprimentos/condicoes-pagamento/${r.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !r.ativo }),
    });
    await load();
  };

  return (
    <div>
      <PageHeader
        title="Condições de Pagamento"
        breadcrumbs={[{ label: "Suprimentos" }, { label: "Cadastros" }, { label: "Condições de Pagamento" }]}
      />
      <div className="px-8 pb-8 max-w-3xl space-y-6">

        {/* Info banner */}
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            A condição de pagamento define a forma de pagamento acordada em uma negociação comercial.
          </p>
        </div>

        {/* Header row */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{rows.length} condição(ões) cadastrada(s)</p>
          <Button size="sm" onClick={startNew} disabled={editingId !== null}>
            <Plus className="w-4 h-4 mr-1" /> Nova Condição
          </Button>
        </div>

        {/* Inline form — new */}
        {editingId === "new" && (
          <CondicaoForm
            form={form} setForm={setForm} saving={saving} error={error}
            onSave={save} onCancel={cancel} isNew
          />
        )}

        {/* List */}
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200 text-xs text-gray-600 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Nome</th>
                <th className="text-left px-4 py-3">Descrição</th>
                <th className="text-center px-4 py-3 w-20">Ativo</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-300" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={4} className="py-10 text-center text-gray-400 text-xs">Nenhuma condição cadastrada</td></tr>
              ) : rows.map((r) => (
                <>
                  <tr key={r.id} className={cn("border-b border-gray-100 last:border-0", !r.ativo && "opacity-50", editingId === r.id ? "bg-blue-50/30" : "hover:bg-gray-50")}>
                    <td className="px-4 py-3 font-medium text-gray-800">{r.nome}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[260px] truncate">{r.descricao || "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleAtivo(r)}>
                        {r.ativo
                          ? <ToggleRight className="w-5 h-5 text-green-500" />
                          : <ToggleLeft className="w-5 h-5 text-gray-300" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        {editingId === r.id ? null : (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-gray-700"
                            onClick={() => startEdit(r)} disabled={editingId !== null}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {editingId === r.id && (
                    <tr key={`${r.id}-edit`} className="bg-blue-50/30 border-b">
                      <td colSpan={4} className="px-4 py-4">
                        <CondicaoForm
                          form={form} setForm={setForm} saving={saving} error={error}
                          onSave={save} onCancel={cancel}
                        />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CondicaoForm({ form, setForm, saving, error, onSave, onCancel, isNew }: {
  form: ReturnType<typeof empty>;
  setForm: React.Dispatch<React.SetStateAction<ReturnType<typeof empty>>>;
  saving: boolean; error: string | null;
  onSave: () => void; onCancel: () => void;
  isNew?: boolean;
}) {
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className={cn("rounded-xl border border-blue-200 bg-white p-5 space-y-4", isNew && "mb-2")}>
      <p className="text-sm font-semibold text-gray-700">{isNew ? "Nova condição de pagamento" : "Editar condição"}</p>

      <div className="space-y-4">
        {/* Nome */}
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Nome *</label>
          <Input value={form.nome} onChange={set("nome")} placeholder="Ex: A Vista, 30/60 DDL, Faturado..." autoFocus={isNew}
            onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }} />
        </div>

        {/* Descrição */}
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Descrição</label>
          <Input value={form.descricao ?? ""} onChange={set("descricao")} placeholder="Observação opcional"
            onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }} />
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}
