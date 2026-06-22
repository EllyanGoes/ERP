"use client";

import { useCallback, useEffect, useState } from "react";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Layers, Plus, Pencil, Trash2, RefreshCw, X, Check } from "lucide-react";

interface Estado {
  id: string;
  codigo: string;
  nome: string;
  ordem: number;
  ativo: boolean;
}

type Form = { id?: string; nome: string; ordem: string; ativo: boolean };
const vazio: Form = { nome: "", ordem: "", ativo: true };

const inputCls = "w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500";

export default function EstadosWipPage() {
  useTabTitle("Estados de WIP");
  const [estados, setEstados] = useState<Estado[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const r = await fetch("/api/pcp/estados-wip");
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao carregar");
      setEstados(j.data ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function abrirNovo() { setForm({ ...vazio, ordem: String((estados.at(-1)?.ordem ?? 0) + 1) }); }
  function abrirEdicao(e: Estado) { setForm({ id: e.id, nome: e.nome, ordem: String(e.ordem), ativo: e.ativo }); }

  async function salvar() {
    if (!form) return;
    if (!form.nome.trim()) { setErro("Nome é obrigatório"); return; }
    setSaving(true);
    setErro(null);
    const payload = { nome: form.nome.trim(), ordem: form.ordem.trim() === "" ? 0 : Number(form.ordem), ativo: form.ativo };
    try {
      const url = form.id ? `/api/pcp/estados-wip/${form.id}` : "/api/pcp/estados-wip";
      const r = await fetch(url, { method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao salvar");
      setForm(null);
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function excluir(e: Estado) {
    if (!confirm(`Excluir o estado "${e.nome}"?`)) return;
    try {
      const r = await fetch(`/api/pcp/estados-wip/${e.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao excluir");
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Estados de WIP"
        subtitle="Fases do produto em processo (úmido, seco, queimado, acabado…). Cada produto declara quais estados atende, e o bloco de WIP do fluxo filtra por eles."
        breadcrumbs={[{ label: "PCP" }, { label: "Estados de WIP" }]}
        action={
          <button type="button" onClick={abrirNovo} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700">
            <Plus className="w-4 h-4" /> Novo estado
          </button>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-8">
        {erro && <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</div>}

        <Dialog open={!!form} onOpenChange={(o) => { if (!o) setForm(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{form?.id ? "Editar estado de WIP" : "Novo estado de WIP"}</DialogTitle>
            </DialogHeader>
            {form && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Nome *</label>
                  <input className={inputCls} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="ex.: Resfriado" autoFocus />
                  {!form.id && <p className="text-[11px] text-muted-foreground mt-1">O código é gerado automaticamente a partir do nome.</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Ordem</label>
                  <input className={inputCls} inputMode="numeric" value={form.ordem} onChange={(e) => setForm({ ...form, ordem: e.target.value })} placeholder="ex.: 5" />
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Ativo
                </label>
              </div>
            )}
            <DialogFooter>
              <button type="button" onClick={() => setForm(null)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
                <X className="w-4 h-4" /> Cancelar
              </button>
              <button type="button" onClick={salvar} disabled={saving} className="inline-flex items-center justify-center gap-1 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50">
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Salvar
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm"><RefreshCw className="w-4 h-4 animate-spin" /> Carregando…</div>
        ) : estados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-cyan-50 dark:bg-cyan-500/15 flex items-center justify-center mb-3"><Layers className="w-7 h-7 text-cyan-400" /></div>
            <p className="text-sm font-medium text-foreground">Nenhum estado de WIP</p>
            <p className="text-xs text-muted-foreground mt-1">Cadastre as fases do produto em processo (úmido, seco, queimado…).</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Código</th>
                  <th className="text-left font-medium px-4 py-2.5">Nome</th>
                  <th className="text-center font-medium px-4 py-2.5 w-20">Ordem</th>
                  <th className="text-center font-medium px-4 py-2.5 w-20">Ativo</th>
                  <th className="px-4 py-2.5 w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {estados.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/60">
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{e.codigo}</td>
                    <td className="px-4 py-2.5 text-foreground">{e.nome}</td>
                    <td className="px-4 py-2.5 text-center text-muted-foreground">{e.ordem}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", e.ativo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>{e.ativo ? "Sim" : "Não"}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => abrirEdicao(e)} title="Editar" className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="w-4 h-4" /></button>
                        <button type="button" onClick={() => excluir(e)} title="Excluir" className="p-1.5 rounded-lg text-muted-foreground hover:bg-danger/10 hover:text-danger"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
