"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";
import { Plus, RefreshCw, X, Check, Factory, LayoutGrid } from "lucide-react";

interface OrdemRow {
  id: string;
  numero: string;
  status: string;
  estadoAtual: string;
  quantidadePlanejada: string | number;
  unidade: string | null;
  item: { codigo: string; descricao: string } | null;
  fluxoNome: string | null;
  fluxoVersao: number | null;
  totalEtapas: number;
  etapasConcluidas: number;
}
interface FluxoOpt { id: string; nome: string; versaoAtivaId: string | null; }

const STATUS_OP: Record<string, { label: string; cls: string }> = {
  RASCUNHO: { label: "Rascunho", cls: "bg-muted text-muted-foreground" },
  LIBERADA: { label: "Liberada", cls: "bg-info/10 text-info" },
  EM_PRODUCAO: { label: "Em produção", cls: "bg-warning/10 text-warning" },
  CONCLUIDA: { label: "Concluída", cls: "bg-success/10 text-success" },
  CANCELADA: { label: "Cancelada", cls: "bg-danger/10 text-danger" },
};
const ESTADO_LABEL: Record<string, string> = { UMIDO: "úmido", SECO: "seco", QUEIMADO: "queimado", ACABADO: "acabado" };

const inputCls = "w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500";

export default function OrdensListaPage() {
  useTabTitle("Ordens de Produção — Lista");
  const router = useRouter();
  const [ordens, setOrdens] = useState<OrdemRow[]>([]);
  const [fluxos, setFluxos] = useState<FluxoOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<{ fluxoId: string; quantidade: string; unidade: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const [ro, rf] = await Promise.all([fetch("/api/pcp/ordens"), fetch("/api/pcp/fluxos")]);
      const [jo, jf] = await Promise.all([ro.json(), rf.json()]);
      if (!ro.ok) throw new Error(jo?.error ?? "Erro ao carregar ordens");
      setOrdens(jo.data ?? []);
      setFluxos((jf.data ?? []).filter((f: FluxoOpt) => f.versaoAtivaId));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function criar() {
    if (!form || !form.fluxoId) { setErro("Escolha um fluxo publicado"); return; }
    const q = Number(form.quantidade);
    if (!Number.isFinite(q) || q <= 0) { setErro("Quantidade deve ser > 0"); return; }
    setBusy(true);
    setErro(null);
    try {
      const r = await fetch("/api/pcp/ordens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fluxoId: form.fluxoId, quantidadePlanejada: q, unidade: form.unidade || "milheiro" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao criar");
      router.push(`/pcp/ordens/${j.data.id}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao criar");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Ordens de Produção — Lista"
        subtitle="Todas as ordens (modelo linear, etapa a etapa). Para o chão de fábrica por área, use o Board."
        breadcrumbs={[{ label: "PCP" }, { label: "Ordens de Produção", href: "/pcp/ordens" }, { label: "Lista" }]}
        action={
          <div className="flex items-center gap-2">
            <Link href="/pcp/ordens" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
              <LayoutGrid className="w-4 h-4" /> Board
            </Link>
            <button
              type="button"
              onClick={() => setForm({ fluxoId: fluxos[0]?.id ?? "", quantidade: "", unidade: "milheiro" })}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> Nova ordem
            </button>
          </div>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-8">
        {erro && <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</div>}

        {form && (
          <div className="mb-4 rounded-xl border border-cyan-200 dark:border-cyan-500/30 bg-cyan-50/40 p-4">
            {fluxos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum fluxo <strong>publicado</strong> ainda. Publique um fluxo em <strong>Fluxos de Produção</strong> para criar ordens.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Fluxo publicado *</label>
                  <ComboboxWithCreate
                    value={form.fluxoId}
                    onChange={(v) => setForm({ ...form, fluxoId: v })}
                    allowNone={false}
                    triggerClassName="h-9 rounded-lg"
                    options={fluxos.map((f) => ({ value: f.id, label: f.nome }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Quantidade *</label>
                  <input className={inputCls} inputMode="decimal" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} placeholder="ex.: 200" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Unidade</label>
                  <input className={inputCls} value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} placeholder="milheiro" />
                </div>
              </div>
            )}
            <div className="mt-3 flex items-center justify-end gap-2">
              <button onClick={() => setForm(null)} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
                <X className="w-4 h-4" /> Cancelar
              </button>
              {fluxos.length > 0 && (
                <button onClick={criar} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50">
                  {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Criar e abrir
                </button>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Carregando…
          </div>
        ) : ordens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-cyan-50 dark:bg-cyan-500/15 flex items-center justify-center mb-3">
              <Factory className="w-7 h-7 text-cyan-400" />
            </div>
            <p className="text-sm font-medium text-foreground">Nenhuma ordem de produção</p>
            <p className="text-xs text-muted-foreground mt-1">Crie uma ordem a partir de um fluxo publicado.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Ordem</th>
                  <th className="text-left font-medium px-4 py-2.5">Fluxo / Produto</th>
                  <th className="text-right font-medium px-4 py-2.5">Qtd</th>
                  <th className="text-center font-medium px-4 py-2.5">Estado</th>
                  <th className="text-center font-medium px-4 py-2.5">Progresso</th>
                  <th className="text-center font-medium px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ordens.map((o) => {
                  const st = STATUS_OP[o.status] ?? { label: o.status, cls: "bg-muted text-muted-foreground" };
                  const pct = o.totalEtapas ? Math.round((o.etapasConcluidas / o.totalEtapas) * 100) : 0;
                  return (
                    <tr key={o.id} onClick={() => router.push(`/pcp/ordens/${o.id}`)} className="hover:bg-cyan-50/40 cursor-pointer">
                      <td className="px-4 py-2.5 font-mono font-medium text-foreground">{o.numero}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {o.fluxoNome ?? "—"}
                        {o.item && <span className="text-muted-foreground"> · {o.item.descricao}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{Number(o.quantidadePlanejada)} {o.unidade}</td>
                      <td className="px-4 py-2.5 text-center text-muted-foreground">{ESTADO_LABEL[o.estadoAtual] ?? o.estadoAtual}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden min-w-[60px]">
                            <div className="h-full bg-cyan-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] text-muted-foreground tabular-nums">{o.etapasConcluidas}/{o.totalEtapas}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", st.cls)}>{st.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
