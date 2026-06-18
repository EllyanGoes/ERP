"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import ItemSearch, { type ItemLite } from "@/components/pcp/ItemSearch";
import { cn } from "@/lib/utils";
import { ClipboardList, Plus, RefreshCw, X, Check, FlaskConical } from "lucide-react";

interface EngRow {
  id: string;
  ativo: boolean;
  item: { id: string; codigo: string; descricao: string } | null;
  fluxo: { id: string; nome: string } | null;
  totalInsumos: number;
}
interface FluxoOpt { id: string; nome: string; versaoAtivaId: string | null; }

const inputCls = "w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500";

export default function EngenhariaPage() {
  useTabTitle("Engenharia do Produto");
  const router = useRouter();
  const [engs, setEngs] = useState<EngRow[]>([]);
  const [fluxos, setFluxos] = useState<FluxoOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState<{ item: ItemLite | null; fluxoId: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const [re, rf] = await Promise.all([fetch("/api/pcp/engenharia"), fetch("/api/pcp/fluxos")]);
      const [je, jf] = await Promise.all([re.json(), rf.json()]);
      if (!re.ok) throw new Error(je?.error ?? "Erro ao carregar");
      setEngs(je.data ?? []);
      setFluxos(jf.data ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function criar() {
    if (!novo?.item || !novo.fluxoId) { setErro("Escolha o produto e o fluxo"); return; }
    setBusy(true);
    setErro(null);
    try {
      const r = await fetch("/api/pcp/engenharia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: novo.item.id, fluxoId: novo.fluxoId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao criar");
      router.push(`/pcp/engenharia/${j.data.id}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao criar");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Engenharia do Produto"
        subtitle="Estrutura (BOM) por produto: qual fluxo ele usa e quais insumos consome (argila, água, caco, biomassa, embalagem)."
        breadcrumbs={[{ label: "PCP" }, { label: "Engenharia do Produto" }]}
        action={
          <button
            type="button"
            onClick={() => setNovo({ item: null, fluxoId: fluxos[0]?.id ?? "" })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700"
          >
            <Plus className="w-4 h-4" /> Nova engenharia
          </button>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-8">
        {erro && <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</div>}

        {novo && (
          <div className="mb-4 rounded-xl border border-cyan-200 dark:border-cyan-500/30 bg-cyan-50/40 p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Produto acabado *</label>
                {novo.item ? (
                  <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
                    <span><span className="font-mono text-muted-foreground text-xs mr-2">{novo.item.codigo}</span>{novo.item.descricao}</span>
                    <button onClick={() => setNovo({ ...novo, item: null })}><X className="w-4 h-4 text-muted-foreground/60 hover:text-muted-foreground" /></button>
                  </div>
                ) : (
                  <ItemSearch onSelect={(it) => setNovo({ ...novo, item: it })} placeholder="Buscar o produto…" />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Fluxo de produção *</label>
                <ComboboxWithCreate
                  value={novo.fluxoId}
                  onChange={(v) => setNovo({ ...novo, fluxoId: v })}
                  noneLabel="—"
                  triggerClassName="h-9 rounded-lg"
                  options={fluxos.map((f) => ({ value: f.id, label: f.nome }))}
                />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button onClick={() => setNovo(null)} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
                <X className="w-4 h-4" /> Cancelar
              </button>
              <button onClick={criar} disabled={busy || !novo.item || !novo.fluxoId} className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50">
                {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Criar e abrir
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm"><RefreshCw className="w-4 h-4 animate-spin" /> Carregando…</div>
        ) : engs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-cyan-50 dark:bg-cyan-500/15 flex items-center justify-center mb-3"><FlaskConical className="w-7 h-7 text-cyan-400" /></div>
            <p className="text-sm font-medium text-foreground">Nenhuma engenharia cadastrada</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">Defina, por produto, o fluxo que ele usa e a lista de insumos (BOM). Um mesmo fluxo serve para vários produtos.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Produto</th>
                  <th className="text-left font-medium px-4 py-2.5">Fluxo</th>
                  <th className="text-center font-medium px-4 py-2.5">Insumos</th>
                  <th className="text-center font-medium px-4 py-2.5">Ativo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {engs.map((e) => (
                  <tr key={e.id} onClick={() => router.push(`/pcp/engenharia/${e.id}`)} className="hover:bg-cyan-50/40 cursor-pointer">
                    <td className="px-4 py-2.5 text-foreground">
                      <span className="font-mono text-muted-foreground text-xs mr-2">{e.item?.codigo}</span>{e.item?.descricao ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{e.fluxo?.nome ?? "—"}</td>
                    <td className="px-4 py-2.5 text-center text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><ClipboardList className="w-3.5 h-3.5 text-muted-foreground/60" /> {e.totalInsumos}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", e.ativo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>{e.ativo ? "Sim" : "Não"}</span>
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
