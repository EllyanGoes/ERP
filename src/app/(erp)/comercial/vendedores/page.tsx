"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Check, ToggleLeft, ToggleRight, Loader2, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";

interface Vendedor {
  id: string;
  nome: string;
  telefone: string | null;
  ativo: boolean;
  usuarioId: string | null;
  usuario: { id: string; nome: string } | null;
}
type UsuarioOpt = { id: string; nome: string; email: string };

const empty = () => ({ nome: "", telefone: "", usuarioId: "" });

export default function VendedoresPage() {
  useTabTitle("Vendedores");
  const [rows, setRows] = useState<Vendedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(empty());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioOpt[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/comercial/vendedores");
    setRows(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/configuracoes/usuarios").then((r) => r.json()).then((j) => setUsuarios(Array.isArray(j.data) ? j.data : [])).catch(() => {});
  }, []);

  const startNew = () => { setForm(empty()); setEditingId("new"); setError(null); };
  const startEdit = (r: Vendedor) => {
    setForm({ nome: r.nome, telefone: r.telefone ?? "", usuarioId: r.usuarioId ?? "" });
    setEditingId(r.id); setError(null);
  };
  const cancel = () => { setEditingId(null); setError(null); };

  const save = async () => {
    setSaving(true); setError(null);
    const url = editingId === "new" ? "/api/comercial/vendedores" : `/api/comercial/vendedores/${editingId}`;
    const method = editingId === "new" ? "POST" : "PATCH";
    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    if (!res.ok) { setError((await res.json()).error ?? "Erro ao salvar"); setSaving(false); return; }
    setEditingId(null); await load(); setSaving(false);
  };

  const toggleAtivo = async (r: Vendedor) => {
    await fetch(`/api/comercial/vendedores/${r.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !r.ativo }),
    });
    await load();
  };

  return (
    <div>
      <PageHeader
        title="Vendedores"
        breadcrumbs={[{ label: "Faturamento" }, { label: "Cadastros" }, { label: "Vendedores" }]}
      />
      <div className="px-8 pb-8 max-w-3xl space-y-6">

        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{rows.length} vendedor(es) cadastrado(s)</p>
          <Button size="sm" onClick={startNew} disabled={editingId !== null}>
            <Plus className="w-4 h-4 mr-1" /> Novo Vendedor
          </Button>
        </div>

        {editingId === "new" && (
          <VendedorForm
            form={form} setForm={setForm} saving={saving} error={error}
            usuarios={usuarios} onSave={save} onCancel={cancel} isNew
          />
        )}

        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200 text-xs text-gray-600 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Nome</th>
                <th className="text-left px-4 py-3">Telefone</th>
                <th className="text-left px-4 py-3">Usuário vinculado</th>
                <th className="text-center px-4 py-3 w-20">Ativo</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-300" /></td></tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-14 text-center">
                    <UserRound className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                    <p className="text-gray-400 text-xs">Nenhum vendedor cadastrado</p>
                  </td>
                </tr>
              ) : rows.map((r) => (
                <>
                  <tr key={r.id} className={cn("border-b border-gray-100 last:border-0", !r.ativo && "opacity-50", editingId === r.id ? "bg-blue-50/30" : "hover:bg-gray-50")}>
                    <td className="px-4 py-3 font-medium text-gray-800">{r.nome}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.telefone || "—"}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.usuario?.nome ?? "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleAtivo(r)}>
                        {r.ativo
                          ? <ToggleRight className="w-5 h-5 text-green-500" />
                          : <ToggleLeft className="w-5 h-5 text-gray-300" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        {editingId !== r.id && (
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
                      <td colSpan={5} className="px-4 py-4">
                        <VendedorForm
                          form={form} setForm={setForm} saving={saving} error={error}
                          usuarios={usuarios} onSave={save} onCancel={cancel}
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

function VendedorForm({ form, setForm, saving, error, usuarios, onSave, onCancel, isNew }: {
  form: ReturnType<typeof empty>;
  setForm: React.Dispatch<React.SetStateAction<ReturnType<typeof empty>>>;
  saving: boolean; error: string | null;
  usuarios: UsuarioOpt[];
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
    <div className={cn("rounded-xl border border-blue-200 bg-white p-5 space-y-4", isNew && "mb-2")}>
      <p className="text-sm font-semibold text-gray-700">{isNew ? "Novo vendedor" : "Editar vendedor"}</p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Nome *</label>
          <Input value={form.nome} onChange={set("nome")} placeholder="Nome do vendedor" autoFocus={isNew} onKeyDown={onKey} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Telefone</label>
          <Input value={form.telefone} onChange={set("telefone")} placeholder="(00) 00000-0000" onKeyDown={onKey} />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-gray-500 mb-1 block">Usuário vinculado</label>
          <ComboboxWithCreate
            value={form.usuarioId}
            onChange={(v) => setForm((f) => ({ ...f, usuarioId: v }))}
            noneLabel="— Sem usuário —"
            triggerClassName="h-10 rounded-lg"
            options={usuarios.map((u) => ({ value: u.id, label: `${u.nome} (${u.email})` }))}
          />
          <p className="text-[11px] text-gray-400 mt-1">Quando esse usuário criar um pedido de venda, este vendedor é puxado automaticamente.</p>
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
