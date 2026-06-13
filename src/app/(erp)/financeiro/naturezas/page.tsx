"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Check, ToggleLeft, ToggleRight, Loader2, Info, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

const GRUPOS = ["RECEITA_OPERACIONAL", "CUSTO_OPERACIONAL", "DESPESA_OPERACIONAL", "INVESTIMENTO", "FINANCIAMENTO"] as const;
type Grupo = (typeof GRUPOS)[number];
const GRUPO_LABEL: Record<Grupo, string> = {
  RECEITA_OPERACIONAL: "Receitas operacionais",
  CUSTO_OPERACIONAL: "Custos operacionais",
  DESPESA_OPERACIONAL: "Despesas operacionais",
  INVESTIMENTO: "Atividades de investimento",
  FINANCIAMENTO: "Atividades de financiamento",
};

type Subgrupo = { id: string; nome: string; grupo: Grupo };
type Natureza = {
  id: string; nome: string; tipo: "ENTRADA" | "SAIDA"; grupo: Grupo;
  subgrupoId: string | null; subgrupo: { id: string; nome: string } | null; ativo: boolean;
};
type FormState = { nome: string; tipo: "ENTRADA" | "SAIDA"; grupo: Grupo; subgrupoId: string };

const empty = (): FormState => ({ nome: "", tipo: "SAIDA", grupo: "DESPESA_OPERACIONAL", subgrupoId: "" });

export default function NaturezasPage() {
  const [rows, setRows] = useState<Natureza[]>([]);
  const [subgrupos, setSubgrupos] = useState<Subgrupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(empty());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [novoSub, setNovoSub] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [n, s] = await Promise.all([
      fetch("/api/financeiro/naturezas").then((r) => r.json()),
      fetch("/api/financeiro/naturezas/subgrupos").then((r) => r.json()),
    ]);
    setRows(n.data ?? []);
    setSubgrupos(s.data ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const startNew = () => { setForm(empty()); setNovoSub(""); setEditingId("new"); setError(null); };
  const startEdit = (r: Natureza) => {
    setForm({ nome: r.nome, tipo: r.tipo, grupo: r.grupo, subgrupoId: r.subgrupoId ?? "" });
    setNovoSub(""); setEditingId(r.id); setError(null);
  };
  const cancel = () => { setEditingId(null); setError(null); };

  async function criarSubgrupo() {
    if (!novoSub.trim()) return;
    const res = await fetch("/api/financeiro/naturezas/subgrupos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: novoSub.trim(), grupo: form.grupo }),
    });
    if (res.ok) {
      const { data } = await res.json();
      setSubgrupos((prev) => [...prev, data]);
      setForm((f) => ({ ...f, subgrupoId: data.id }));
      setNovoSub("");
    }
  }

  const save = async () => {
    if (!form.nome.trim()) { setError("Informe o nome."); return; }
    setSaving(true); setError(null);
    const url = editingId === "new" ? "/api/financeiro/naturezas" : `/api/financeiro/naturezas/${editingId}`;
    const method = editingId === "new" ? "POST" : "PATCH";
    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: form.nome, tipo: form.tipo, grupo: form.grupo, subgrupoId: form.subgrupoId || null }),
    });
    if (!res.ok) { setError((await res.json()).error ?? "Erro ao salvar"); setSaving(false); return; }
    setEditingId(null); await load(); setSaving(false);
  };

  const toggleAtivo = async (r: Natureza) => {
    await fetch(`/api/financeiro/naturezas/${r.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !r.ativo }),
    });
    await load();
  };

  const subsDoGrupo = subgrupos.filter((s) => s.grupo === form.grupo);

  return (
    <div>
      <PageHeader
        title="Naturezas Financeiras"
        breadcrumbs={[{ label: "Financeiro" }, { label: "Cadastros" }, { label: "Naturezas Financeiras" }]}
        action={<Button size="sm" onClick={startNew} disabled={editingId !== null}><Plus className="w-4 h-4 mr-1" /> Nova Natureza</Button>}
      />
      <div className="px-8 pb-8 max-w-3xl space-y-6">
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            A natureza classifica os títulos por <b>tipo</b> (entrada/saída) e <b>grupo</b> do fluxo de caixa. É escolhida no Pedido de Venda e no Documento de Entrada e diferente do plano de contas.
          </p>
        </div>

        {editingId === "new" && (
          <NaturezaForm form={form} setForm={setForm} subs={subsDoGrupo} novoSub={novoSub} setNovoSub={setNovoSub} onCriarSub={criarSubgrupo} saving={saving} error={error} onSave={save} onCancel={cancel} isNew />
        )}

        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200 text-xs text-gray-600 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Natureza</th>
                <th className="text-left px-4 py-3">Tipo</th>
                <th className="text-left px-4 py-3">Grupo · Subgrupo</th>
                <th className="text-center px-4 py-3 w-20">Ativo</th>
                <th className="px-4 py-3 w-12" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-300" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="py-10 text-center text-gray-400 text-xs">Nenhuma natureza cadastrada</td></tr>
              ) : rows.map((r) => (
                <>
                  <tr key={r.id} className={cn("border-b border-gray-100 last:border-0", !r.ativo && "opacity-50", editingId === r.id ? "bg-blue-50/30" : "hover:bg-gray-50")}>
                    <td className="px-4 py-3 font-medium text-gray-800">{r.nome}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", r.tipo === "ENTRADA" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
                        {r.tipo === "ENTRADA" ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                        {r.tipo === "ENTRADA" ? "Entrada" : "Saída"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{GRUPO_LABEL[r.grupo]}{r.subgrupo ? ` · ${r.subgrupo.nome}` : ""}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleAtivo(r)}>{r.ativo ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-gray-300" />}</button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editingId === r.id ? null : (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-gray-700" onClick={() => startEdit(r)} disabled={editingId !== null}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                  {editingId === r.id && (
                    <tr key={`${r.id}-edit`} className="bg-blue-50/30 border-b">
                      <td colSpan={5} className="px-4 py-4">
                        <NaturezaForm form={form} setForm={setForm} subs={subsDoGrupo} novoSub={novoSub} setNovoSub={setNovoSub} onCriarSub={criarSubgrupo} saving={saving} error={error} onSave={save} onCancel={cancel} />
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

function NaturezaForm({ form, setForm, subs, novoSub, setNovoSub, onCriarSub, saving, error, onSave, onCancel, isNew }: {
  form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>;
  subs: Subgrupo[]; novoSub: string; setNovoSub: (v: string) => void; onCriarSub: () => void;
  saving: boolean; error: string | null; onSave: () => void; onCancel: () => void; isNew?: boolean;
}) {
  return (
    <div className={cn("rounded-xl border border-blue-200 bg-white p-5 space-y-4", isNew && "mb-2")}>
      <p className="text-sm font-semibold text-gray-700">{isNew ? "Nova natureza financeira" : "Editar natureza"}</p>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Nome *</label>
          <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Ex: Venda de mercadorias, Aluguel..." autoFocus={isNew}
            onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Tipo *</label>
            <select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as "ENTRADA" | "SAIDA" }))} className="w-full h-10 rounded-md border border-gray-300 px-3 text-sm bg-white">
              <option value="ENTRADA">Entrada</option>
              <option value="SAIDA">Saída</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Grupo *</label>
            <select value={form.grupo} onChange={(e) => setForm((f) => ({ ...f, grupo: e.target.value as Grupo, subgrupoId: "" }))} className="w-full h-10 rounded-md border border-gray-300 px-3 text-sm bg-white">
              {GRUPOS.map((g) => <option key={g} value={g}>{GRUPO_LABEL[g]}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Subgrupo (opcional)</label>
          <select value={form.subgrupoId} onChange={(e) => setForm((f) => ({ ...f, subgrupoId: e.target.value }))} className="w-full h-10 rounded-md border border-gray-300 px-3 text-sm bg-white">
            <option value="">— Sem subgrupo —</option>
            {subs.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          <div className="flex gap-2 mt-2">
            <Input value={novoSub} onChange={(e) => setNovoSub(e.target.value)} placeholder="Novo subgrupo neste grupo" className="h-9"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onCriarSub(); } }} />
            <Button type="button" size="sm" variant="outline" onClick={onCriarSub} disabled={!novoSub.trim()}>Criar</Button>
          </div>
        </div>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" onClick={onSave} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />} Salvar</Button>
      </div>
    </div>
  );
}
