"use client";

import { useCallback, useEffect, useState } from "react";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import ItemSearch, { type ItemLite } from "@/components/pcp/ItemSearch";
import { cn } from "@/lib/utils";
import { Plus, Trash2, RefreshCw, Calculator, X, Check, AlertTriangle, CalendarRange } from "lucide-react";

interface MpsLinha {
  id: string;
  periodo: string;
  quantidade: string | number;
  origem: string;
  item: { id: string; codigo: string; descricao: string };
}
interface Necessidade {
  insumoItemId: string;
  codigo: string;
  descricao: string;
  categoria: string;
  bruta: number;
  disponivel: number;
  liquida: number;
}
interface ResultadoMrp {
  necessidades: Necessidade[];
  semEngenharia: { itemId: string; descricao: string; quantidade: number }[];
  produtosPlanejados: number;
}

const CAT_LABEL: Record<string, string> = {
  MATERIA_PRIMA: "Matéria-prima", MISTURA: "Mistura", EMBALAGEM: "Embalagem", ENERGIA: "Energia", OUTRO: "Outro",
};
const ORIGEM_LABEL: Record<string, string> = { MANUAL: "manual", PEDIDO_VENDA: "pedidos", MIN_MAX: "mín/máx" };
const inputCls = "rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500";

function mesAtual() {
  // sem Date.now em libs; aqui é client, mas evito new Date — uso o input controlado vazio
  return "";
}

export default function PlanejamentoPage() {
  useTabTitle("Planejamento (MPS/MRP)");
  const [linhas, setLinhas] = useState<MpsLinha[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState<{ item: ItemLite | null; periodo: string; quantidade: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [mrp, setMrp] = useState<ResultadoMrp | null>(null);
  const [calc, setCalc] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const r = await fetch("/api/pcp/mps");
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao carregar");
      setLinhas(j.data ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addLinha() {
    if (!novo?.item || !/^\d{4}-\d{2}$/.test(novo.periodo)) { setErro("Escolha produto e período"); return; }
    const q = Number(novo.quantidade);
    if (!Number.isFinite(q) || q <= 0) { setErro("Quantidade deve ser > 0"); return; }
    setBusy(true);
    setErro(null);
    try {
      const r = await fetch("/api/pcp/mps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: novo.item.id, periodo: novo.periodo, quantidade: q }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao adicionar");
      setNovo(null);
      setMrp(null);
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao adicionar");
    } finally {
      setBusy(false);
    }
  }

  async function excluir(l: MpsLinha) {
    try {
      const r = await fetch(`/api/pcp/mps/${l.id}`, { method: "DELETE" });
      if (!r.ok) { const j = await r.json(); throw new Error(j?.error ?? "Erro"); }
      setMrp(null);
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao excluir");
    }
  }

  async function calcularMrp() {
    setCalc(true);
    setErro(null);
    try {
      const r = await fetch("/api/pcp/mrp");
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao calcular");
      setMrp(j.data);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao calcular");
    } finally {
      setCalc(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Planejamento (MPS / MRP)"
        subtitle="Plano mestre: o que produzir por produto e período. O MRP explode os insumos (via Engenharia) e abate o estoque."
        breadcrumbs={[{ label: "PCP" }, { label: "Planejamento" }]}
        action={
          <div className="flex items-center gap-2">
            <button onClick={calcularMrp} disabled={calc || linhas.length === 0} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-medium text-cyan-700 hover:bg-cyan-100 disabled:opacity-50">
              {calc ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />} Calcular necessidades (MRP)
            </button>
            <button onClick={() => setNovo({ item: null, periodo: mesAtual(), quantidade: "" })} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700">
              <Plus className="w-4 h-4" /> Nova demanda
            </button>
          </div>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-8 space-y-4">
        {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}

        {novo && (
          <div className="rounded-xl border border-cyan-200 bg-cyan-50/40 p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Produto *</label>
                {novo.item ? (
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                    <span className="truncate"><span className="font-mono text-gray-400 text-xs mr-2">{novo.item.codigo}</span>{novo.item.descricao}</span>
                    <button onClick={() => setNovo({ ...novo, item: null })}><X className="w-4 h-4 text-gray-300 hover:text-gray-500" /></button>
                  </div>
                ) : (
                  <ItemSearch onSelect={(it) => setNovo({ ...novo, item: it })} placeholder="Buscar produto acabado…" />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Período (mês) *</label>
                <input type="month" className={inputCls + " w-full"} value={novo.periodo} onChange={(e) => setNovo({ ...novo, periodo: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Quantidade (milheiros) *</label>
                <input className={inputCls + " w-full"} inputMode="decimal" value={novo.quantidade} onChange={(e) => setNovo({ ...novo, quantidade: e.target.value })} placeholder="ex.: 200" />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button onClick={() => setNovo(null)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"><X className="w-4 h-4" /> Cancelar</button>
              <button onClick={addLinha} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50">
                {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Adicionar
              </button>
            </div>
          </div>
        )}

        {/* MPS */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><CalendarRange className="w-4 h-4 text-cyan-500" /> Plano Mestre (demanda)</h3>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-gray-400 gap-2 text-sm"><RefreshCw className="w-4 h-4 animate-spin" /> Carregando…</div>
          ) : linhas.length === 0 ? (
            <p className="text-xs text-gray-400 py-6 text-center rounded-xl border border-dashed border-gray-200">Sem demanda planejada. Use o botão Nova demanda (manual) por produto e mês.</p>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="text-left font-medium px-4 py-2">Produto</th>
                    <th className="text-left font-medium px-4 py-2 w-28">Período</th>
                    <th className="text-right font-medium px-4 py-2 w-32">Quantidade</th>
                    <th className="text-center font-medium px-4 py-2 w-24">Origem</th>
                    <th className="px-4 py-2 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {linhas.map((l) => (
                    <tr key={l.id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-2 text-gray-800"><span className="font-mono text-gray-400 text-xs mr-2">{l.item.codigo}</span>{l.item.descricao}</td>
                      <td className="px-4 py-2 text-gray-600 tabular-nums">{l.periodo}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-700">{Number(l.quantidade)}</td>
                      <td className="px-4 py-2 text-center text-xs text-gray-400">{ORIGEM_LABEL[l.origem] ?? l.origem}</td>
                      <td className="px-4 py-2 text-right"><button onClick={() => excluir(l)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* MRP */}
        {mrp && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><Calculator className="w-4 h-4 text-cyan-500" /> Necessidades (MRP) — {mrp.produtosPlanejados} produto(s)</h3>
            {mrp.semEngenharia.length > 0 && (
              <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
                <span>Sem engenharia (BOM) cadastrada — não explodiram: {mrp.semEngenharia.map((s) => s.descricao).join(", ")}. Cadastre em <strong>Engenharia do Produto</strong>.</span>
              </div>
            )}
            {mrp.necessidades.length === 0 ? (
              <p className="text-xs text-gray-400 py-6 text-center rounded-xl border border-dashed border-gray-200">Nenhuma necessidade (sem BOM ou sem demanda).</p>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="text-left font-medium px-4 py-2">Insumo</th>
                      <th className="text-left font-medium px-4 py-2 w-32">Categoria</th>
                      <th className="text-right font-medium px-4 py-2 w-28">Bruta</th>
                      <th className="text-right font-medium px-4 py-2 w-28">Em estoque</th>
                      <th className="text-right font-medium px-4 py-2 w-28">A comprar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {mrp.necessidades.map((n) => (
                      <tr key={n.insumoItemId} className={cn(n.liquida > 0 && "bg-rose-50/40")}>
                        <td className="px-4 py-2 text-gray-800"><span className="font-mono text-gray-400 text-xs mr-2">{n.codigo}</span>{n.descricao}</td>
                        <td className="px-4 py-2 text-gray-500 text-xs">{CAT_LABEL[n.categoria] ?? n.categoria}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-700">{n.bruta}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-500">{n.disponivel}</td>
                        <td className={cn("px-4 py-2 text-right tabular-nums font-medium", n.liquida > 0 ? "text-rose-600" : "text-emerald-600")}>{n.liquida}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-gray-400 mt-1.5">Bruta = demanda × estrutura (BOM). A comprar = bruta − estoque. (Gross-up de perda por etapa entra numa evolução.)</p>
          </div>
        )}
      </div>
    </div>
  );
}
