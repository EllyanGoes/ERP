"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Pencil, Check, ToggleLeft, ToggleRight, Loader2, Info,
  Banknote, CreditCard, Smartphone, Building2, FileText, BookCheck, HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TIPOS = [
  { value: "PIX",            label: "PIX",              icon: Smartphone,  color: "text-success bg-success/10" },
  { value: "TRANSFERENCIA",  label: "Transferência",    icon: Building2,   color: "text-info bg-info/10" },
  { value: "BOLETO",         label: "Boleto",           icon: FileText,    color: "text-warning bg-warning/10" },
  { value: "CARTAO_CREDITO", label: "Cartão de Crédito",icon: CreditCard,  color: "text-purple-600 bg-purple-50" },
  { value: "CARTAO_DEBITO",  label: "Cartão de Débito", icon: CreditCard,  color: "text-indigo-600 bg-indigo-50" },
  { value: "DINHEIRO",       label: "Dinheiro",         icon: Banknote,    color: "text-success bg-success/10" },
  { value: "CHEQUE",         label: "Cheque",           icon: BookCheck,   color: "text-muted-foreground bg-muted" },
  { value: "OUTROS",         label: "Outros",           icon: HelpCircle,  color: "text-muted-foreground bg-muted" },
] as const;

type TipoValue = typeof TIPOS[number]["value"];

interface Forma {
  id: string;
  nome: string;
  tipo: TipoValue;
  descricao: string | null;
  ativo: boolean;
}

const emptyForm = () => ({ nome: "", tipo: "OUTROS" as TipoValue, descricao: "" });

function TipoBadge({ tipo }: { tipo: TipoValue }) {
  const t = TIPOS.find((x) => x.value === tipo) ?? TIPOS[TIPOS.length - 1];
  const Icon = t.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full", t.color)}>
      <Icon className="w-3 h-3" /> {t.label}
    </span>
  );
}

export default function FormasPagamentoPage() {
  const [rows, setRows] = useState<Forma[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/suprimentos/formas-pagamento");
    setRows(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const startNew = () => { setForm(emptyForm()); setEditingId("new"); setError(null); };
  const startEdit = (r: Forma) => {
    setForm({ nome: r.nome, tipo: r.tipo, descricao: r.descricao ?? "" });
    setEditingId(r.id); setError(null);
  };
  const cancel = () => { setEditingId(null); setError(null); };

  const save = async () => {
    setSaving(true); setError(null);
    const url = editingId === "new"
      ? "/api/suprimentos/formas-pagamento"
      : `/api/suprimentos/formas-pagamento/${editingId}`;
    const res = await fetch(url, {
      method: editingId === "new" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) { setError((await res.json()).error ?? "Erro ao salvar"); setSaving(false); return; }
    setEditingId(null); await load(); setSaving(false);
  };

  const toggleAtivo = async (r: Forma) => {
    await fetch(`/api/suprimentos/formas-pagamento/${r.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !r.ativo }),
    });
    await load();
  };

  // Group rows by tipo for display
  const grouped = TIPOS.map((t) => ({
    ...t,
    items: rows.filter((r) => r.tipo === t.value),
  })).filter((g) => g.items.length > 0);

  return (
    <div>
      <PageHeader
        title="Formas de Pagamento"
        breadcrumbs={[{ label: "Suprimentos" }, { label: "Cadastros" }, { label: "Formas de Pagamento" }]}
      />
      <div className="px-8 pb-8 max-w-3xl space-y-6">

        {/* Info */}
        <div className="flex items-start gap-3 bg-info/10 border border-info/20 rounded-xl p-4 text-sm text-info">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            Cadastro das formas de pagamento — representa como os pagamentos e recebimentos
            são realizados fisicamente (PIX, Boleto, Cartão, etc.).
          </p>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{rows.length} forma(s) cadastrada(s)</p>
          <Button size="sm" onClick={startNew} disabled={editingId !== null}>
            <Plus className="w-4 h-4 mr-1" /> Nova Forma
          </Button>
        </div>

        {/* Inline new form */}
        {editingId === "new" && (
          <FormaForm form={form} setForm={setForm} saving={saving} error={error}
            onSave={save} onCancel={cancel} isNew />
        )}

        {/* Table */}
        <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                <th className="text-left px-4 py-3">Nome</th>
                <th className="text-left px-4 py-3">Tipo</th>
                <th className="text-left px-4 py-3">Descrição</th>
                <th className="text-center px-4 py-3 w-20">Ativo</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground/60" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="py-10 text-center text-muted-foreground text-xs">Nenhuma forma de pagamento cadastrada</td></tr>
              ) : rows.map((r) => (
                <>
                  <tr key={r.id} className={cn("border-b border-border last:border-0", !r.ativo && "opacity-50", editingId === r.id ? "bg-info/10" : "hover:bg-muted")}>
                    <td className="px-4 py-3 font-medium text-foreground">{r.nome}</td>
                    <td className="px-4 py-3"><TipoBadge tipo={r.tipo} /></td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-[200px] truncate">{r.descricao ?? "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleAtivo(r)}>
                        {r.ativo
                          ? <ToggleRight className="w-5 h-5 text-green-500" />
                          : <ToggleLeft className="w-5 h-5 text-muted-foreground/60" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editingId !== r.id && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => startEdit(r)} disabled={editingId !== null}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                  {editingId === r.id && (
                    <tr key={`${r.id}-edit`} className="bg-info/10 border-b">
                      <td colSpan={5} className="px-4 py-4">
                        <FormaForm form={form} setForm={setForm} saving={saving} error={error}
                          onSave={save} onCancel={cancel} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>

        {/* Cards by type */}
        {!loading && rows.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Por tipo</p>
            <div className="grid grid-cols-4 gap-3">
              {grouped.map((g) => {
                const Icon = g.icon;
                return (
                  <div key={g.value} className={cn("rounded-xl p-3 flex items-center gap-2.5", g.color.split(" ")[1])}>
                    <Icon className={cn("w-4 h-4 shrink-0", g.color.split(" ")[0])} />
                    <div>
                      <p className="text-xs font-semibold text-foreground">{g.label}</p>
                      <p className="text-xs text-muted-foreground">{g.items.length} forma(s)</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FormaForm({ form, setForm, saving, error, onSave, onCancel, isNew }: {
  form: ReturnType<typeof emptyForm>;
  setForm: React.Dispatch<React.SetStateAction<ReturnType<typeof emptyForm>>>;
  saving: boolean; error: string | null;
  onSave: () => void; onCancel: () => void;
  isNew?: boolean;
}) {
  return (
    <div className="rounded-xl border border-info/30 bg-card p-5 space-y-4">
      <p className="text-sm font-semibold text-foreground">{isNew ? "Nova forma de pagamento" : "Editar forma"}</p>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome *</label>
          <Input value={form.nome}
            onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
            placeholder="Ex: PIX Banco do Brasil" autoFocus={isNew}
            onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }} />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo *</label>
          <div className="grid grid-cols-2 gap-1.5">
            {TIPOS.map((t) => {
              const Icon = t.icon;
              const sel = form.tipo === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, tipo: t.value }))}
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs font-medium transition-colors",
                    sel
                      ? "border-blue-400 bg-info/10 text-info"
                      : "border-border text-muted-foreground hover:border-border hover:bg-muted"
                  )}
                >
                  <Icon className={cn("w-3.5 h-3.5", sel ? "text-info" : "text-muted-foreground")} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Descrição</label>
          <Input value={form.descricao}
            onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
            placeholder="Observação opcional" />
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
