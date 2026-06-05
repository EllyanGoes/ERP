"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

const inputCls = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500";

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
        {erro && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}

        {novo && (
          <div className="mb-4 rounded-xl border border-cyan-200 bg-cyan-50/40 p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Produto acabado *</label>
                {novo.item ? (
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                    <span><span className="font-mono text-gray-400 text-xs mr-2">{novo.item.codigo}</span>{novo.item.descricao}</span>
                    <button onClick={() => setNovo({ ...novo, item: null })}><X className="w-4 h-4 text-gray-300 hover:text-gray-500" /></button>
                  </div>
                ) : (
                  <ItemSearch onSelect={(it) => setNovo({ ...novo, item: it })} placeholder="Buscar o produto…" />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Fluxo de produção *</label>
                <select className={inputCls} value={novo.fluxoId} onChange={(e) => setNovo({ ...novo, fluxoId: e.target.value })}>
                  <option value="">—</option>
                  {fluxos.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button onClick={() => setNovo(null)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
                <X className="w-4 h-4" /> Cancelar
              </button>
              <button onClick={criar} disabled={busy || !novo.item || !novo.fluxoId} className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50">
                {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Criar e abrir
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-2 text-sm"><RefreshCw className="w-4 h-4 animate-spin" /> Carregando…</div>
        ) : engs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-cyan-50 flex items-center justify-center mb-3"><FlaskConical className="w-7 h-7 text-cyan-400" /></div>
            <p className="text-sm font-medium text-gray-700">Nenhuma engenharia cadastrada</p>
            <p className="text-xs text-gray-400 mt-1 max-w-sm">Defina, por produto, o fluxo que ele usa e a lista de insumos (BOM). Um mesmo fluxo serve para vários produtos.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Produto</th>
                  <th className="text-left font-medium px-4 py-2.5">Fluxo</th>
                  <th className="text-center font-medium px-4 py-2.5">Insumos</th>
                  <th className="text-center font-medium px-4 py-2.5">Ativo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {engs.map((e) => (
                  <tr key={e.id} onClick={() => router.push(`/pcp/engenharia/${e.id}`)} className="hover:bg-cyan-50/40 cursor-pointer">
                    <td className="px-4 py-2.5 text-gray-800">
                      <span className="font-mono text-gray-400 text-xs mr-2">{e.item?.codigo}</span>{e.item?.descricao ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{e.fluxo?.nome ?? "—"}</td>
                    <td className="px-4 py-2.5 text-center text-gray-600">
                      <span className="inline-flex items-center gap-1"><ClipboardList className="w-3.5 h-3.5 text-gray-300" /> {e.totalInsumos}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", e.ativo ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-400")}>{e.ativo ? "Sim" : "Não"}</span>
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
