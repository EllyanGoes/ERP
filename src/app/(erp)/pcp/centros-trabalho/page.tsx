"use client";

import { useCallback, useEffect, useState } from "react";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";
import { Boxes, Plus, Pencil, Trash2, RefreshCw, X, Check } from "lucide-react";

type Tipo = "PREPARACAO" | "CONFORMACAO" | "SECAGEM" | "FORNO" | "EMBALAGEM" | "TRANSPORTE" | "OUTRO";

interface Centro {
  id: string;
  codigo: string;
  nome: string;
  tipo: Tipo | null;
  codApl: number | null;
  capacidadePadrao: string | number | null;
  unidadeCapacidade: string | null;
  ativo: boolean;
  observacao: string | null;
}

const TIPO_LABEL: Record<Tipo, string> = {
  PREPARACAO: "Preparação",
  CONFORMACAO: "Conformação",
  SECAGEM: "Secagem",
  FORNO: "Forno",
  EMBALAGEM: "Embalagem",
  TRANSPORTE: "Transporte",
  OUTRO: "Outro",
};
const TIPOS = Object.keys(TIPO_LABEL) as Tipo[];

type Form = {
  id?: string;
  codigo: string;
  nome: string;
  tipo: Tipo | "";
  codApl: string;
  capacidadePadrao: string;
  unidadeCapacidade: string;
  ativo: boolean;
};
const vazio: Form = { codigo: "", nome: "", tipo: "", codApl: "", capacidadePadrao: "", unidadeCapacidade: "", ativo: true };

const inputCls =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500";

export default function CentrosTrabalhoPage() {
  useTabTitle("Centros de Trabalho");
  const [centros, setCentros] = useState<Centro[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const r = await fetch("/api/pcp/centros-trabalho");
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao carregar");
      setCentros(j.data ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function abrirNovo() { setForm({ ...vazio }); }
  function abrirEdicao(c: Centro) {
    setForm({
      id: c.id, codigo: c.codigo, nome: c.nome, tipo: c.tipo ?? "",
      codApl: c.codApl != null ? String(c.codApl) : "",
      capacidadePadrao: c.capacidadePadrao != null ? String(c.capacidadePadrao) : "",
      unidadeCapacidade: c.unidadeCapacidade ?? "", ativo: c.ativo,
    });
  }

  async function salvar() {
    if (!form) return;
    if (!form.codigo.trim() || !form.nome.trim()) { setErro("Código e nome são obrigatórios"); return; }
    setSaving(true);
    setErro(null);
    const payload = {
      codigo: form.codigo.trim(),
      nome: form.nome.trim(),
      tipo: form.tipo || null,
      codApl: form.codApl.trim() === "" ? null : Number(form.codApl),
      capacidadePadrao: form.capacidadePadrao.trim() === "" ? null : Number(form.capacidadePadrao),
      unidadeCapacidade: form.unidadeCapacidade.trim() || null,
      ativo: form.ativo,
    };
    try {
      const url = form.id ? `/api/pcp/centros-trabalho/${form.id}` : "/api/pcp/centros-trabalho";
      const r = await fetch(url, {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
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

  async function excluir(c: Centro) {
    if (!confirm(`Excluir o centro "${c.nome}"?`)) return;
    try {
      const r = await fetch(`/api/pcp/centros-trabalho/${c.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao excluir");
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao excluir");
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Centros de Trabalho"
        subtitle="Recursos da produção (preparação, secagem, forno…). O forno/secador pode apontar para um ativo do Engeman."
        breadcrumbs={[{ label: "PCP" }, { label: "Centros de Trabalho" }]}
        action={
          <button
            type="button"
            onClick={abrirNovo}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700"
          >
            <Plus className="w-4 h-4" /> Novo centro
          </button>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-8">
        {erro && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
        )}

        {form && (
          <div className="mb-4 rounded-xl border border-cyan-200 bg-cyan-50/40 p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Código *</label>
                <input className={inputCls} value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="ex.: FORNO-01" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Nome *</label>
                <input className={inputCls} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="ex.: Forno de Queima" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
                <select className={inputCls} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as Tipo | "" })}>
                  <option value="">—</option>
                  {TIPOS.map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Ativo Engeman (codApl)</label>
                <input className={inputCls} inputMode="numeric" value={form.codApl} onChange={(e) => setForm({ ...form, codApl: e.target.value })} placeholder="opcional" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Capacidade</label>
                  <input className={inputCls} inputMode="decimal" value={form.capacidadePadrao} onChange={(e) => setForm({ ...form, capacidadePadrao: e.target.value })} placeholder="ex.: 20" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Unidade</label>
                  <input className={inputCls} value={form.unidadeCapacidade} onChange={(e) => setForm({ ...form, unidadeCapacidade: e.target.value })} placeholder="milheiro/ciclo" />
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
                Ativo
              </label>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setForm(null)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
                  <X className="w-4 h-4" /> Cancelar
                </button>
                <button type="button" onClick={salvar} disabled={saving} className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50">
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Salvar
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-2 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Carregando…
          </div>
        ) : centros.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-cyan-50 flex items-center justify-center mb-3">
              <Boxes className="w-7 h-7 text-cyan-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">Nenhum centro de trabalho</p>
            <p className="text-xs text-gray-400 mt-1">Cadastre os recursos da produção (forno, secador, prensa…).</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Código</th>
                  <th className="text-left font-medium px-4 py-2.5">Nome</th>
                  <th className="text-left font-medium px-4 py-2.5">Tipo</th>
                  <th className="text-right font-medium px-4 py-2.5">Capacidade</th>
                  <th className="text-center font-medium px-4 py-2.5">Engeman</th>
                  <th className="text-center font-medium px-4 py-2.5">Ativo</th>
                  <th className="px-4 py-2.5 w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {centros.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2.5 font-mono text-gray-700">{c.codigo}</td>
                    <td className="px-4 py-2.5 text-gray-800">{c.nome}</td>
                    <td className="px-4 py-2.5 text-gray-600">{c.tipo ? TIPO_LABEL[c.tipo] : "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                      {c.capacidadePadrao != null ? `${c.capacidadePadrao} ${c.unidadeCapacidade ?? ""}`.trim() : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-center text-gray-500">{c.codApl ?? "—"}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", c.ativo ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-400")}>
                        {c.ativo ? "Sim" : "Não"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => abrirEdicao(c)} title="Editar" className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => excluir(c)} title="Excluir" className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
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
