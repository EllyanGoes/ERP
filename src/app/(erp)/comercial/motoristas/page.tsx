"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Check, ToggleLeft, ToggleRight, Loader2, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";

interface Motorista {
  id: string;
  nome: string;
  cpf: string | null;
  cnh: string | null;
  telefone: string | null;
  ativo: boolean;
}

const empty = () => ({ nome: "", cpf: "", cnh: "", telefone: "" });

export default function MotoristasPage() {
  useTabTitle("Motoristas");
  const [rows, setRows] = useState<Motorista[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(empty());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/comercial/motoristas");
    setRows(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const startNew = () => { setForm(empty()); setEditingId("new"); setError(null); };
  const startEdit = (r: Motorista) => {
    setForm({ nome: r.nome, cpf: r.cpf ?? "", cnh: r.cnh ?? "", telefone: r.telefone ?? "" });
    setEditingId(r.id); setError(null);
  };
  const cancel = () => { setEditingId(null); setError(null); };

  const save = async () => {
    setSaving(true); setError(null);
    const url = editingId === "new" ? "/api/comercial/motoristas" : `/api/comercial/motoristas/${editingId}`;
    const method = editingId === "new" ? "POST" : "PATCH";
    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    if (!res.ok) { setError((await res.json()).error ?? "Erro ao salvar"); setSaving(false); return; }
    setEditingId(null); await load(); setSaving(false);
  };

  const toggleAtivo = async (r: Motorista) => {
    await fetch(`/api/comercial/motoristas/${r.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !r.ativo }),
    });
    await load();
  };

  return (
    <div>
      <PageHeader
        title="Motoristas"
        breadcrumbs={[{ label: "Faturamento" }, { label: "Cadastros" }, { label: "Motoristas" }]}
      />
      <div className="px-8 pb-8 max-w-4xl space-y-6">

        {/* Header row */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{rows.length} motorista(s) cadastrado(s)</p>
          <Button size="sm" onClick={startNew} disabled={editingId !== null}>
            <Plus className="w-4 h-4 mr-1" /> Novo Motorista
          </Button>
        </div>

        {/* Inline form — new */}
        {editingId === "new" && (
          <MotoristaForm
            form={form} setForm={setForm} saving={saving} error={error}
            onSave={save} onCancel={cancel} isNew
          />
        )}

        {/* List */}
        <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                <th className="text-left px-4 py-3">Nome</th>
                <th className="text-left px-4 py-3">CPF</th>
                <th className="text-left px-4 py-3">CNH</th>
                <th className="text-left px-4 py-3">Telefone</th>
                <th className="text-center px-4 py-3 w-20">Ativo</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground/60" /></td></tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center">
                    <Truck className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                    <p className="text-muted-foreground text-xs">Nenhum motorista cadastrado</p>
                  </td>
                </tr>
              ) : rows.map((r) => (
                <>
                  <tr key={r.id} className={cn("border-b border-border last:border-0", !r.ativo && "opacity-50", editingId === r.id ? "bg-info/10" : "hover:bg-muted")}>
                    <td className="px-4 py-3 font-medium text-foreground">{r.nome}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.cpf || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.cnh || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.telefone || "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleAtivo(r)}>
                        {r.ativo
                          ? <ToggleRight className="w-5 h-5 text-green-500" />
                          : <ToggleLeft className="w-5 h-5 text-muted-foreground/60" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        {editingId !== r.id && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => startEdit(r)} disabled={editingId !== null}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {editingId === r.id && (
                    <tr key={`${r.id}-edit`} className="bg-info/10 border-b">
                      <td colSpan={6} className="px-4 py-4">
                        <MotoristaForm
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

function MotoristaForm({ form, setForm, saving, error, onSave, onCancel, isNew }: {
  form: ReturnType<typeof empty>;
  setForm: React.Dispatch<React.SetStateAction<ReturnType<typeof empty>>>;
  saving: boolean; error: string | null;
  onSave: () => void; onCancel: () => void;
  isNew?: boolean;
}) {
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onSave();
    if (e.key === "Escape") onCancel();
  };

  return (
    <div className={cn("rounded-xl border border-info/30 bg-card p-5 space-y-4", isNew && "mb-2")}>
      <p className="text-sm font-semibold text-foreground">{isNew ? "Novo motorista" : "Editar motorista"}</p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome *</label>
          <Input value={form.nome} onChange={set("nome")} placeholder="Nome completo" autoFocus={isNew} onKeyDown={onKey} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Telefone</label>
          <Input value={form.telefone} onChange={set("telefone")} placeholder="(00) 00000-0000" onKeyDown={onKey} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">CPF</label>
          <Input value={form.cpf} onChange={set("cpf")} placeholder="000.000.000-00" onKeyDown={onKey} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">CNH</label>
          <Input value={form.cnh} onChange={set("cnh")} placeholder="Número da CNH" onKeyDown={onKey} />
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
