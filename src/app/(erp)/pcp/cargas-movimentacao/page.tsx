"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { useTabTitle } from "@/lib/tabs-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save, RefreshCw, Truck } from "lucide-react";

type Veiculo = "VAGONETA" | "VAGAO";
const VEIC_LABEL: Record<Veiculo, string> = { VAGONETA: "Vagoneta", VAGAO: "Vagão" };
type EtapaCfg = { etapa: string; veiculos: Veiculo[] };
type ProdutoCfg = { itemId: string; codigo: string; descricao: string; capacidades: Record<Veiculo, number | null> };

export default function CargasMovimentacaoPage() {
  useTabTitle("Cargas de Movimentação");
  const [veiculos, setVeiculos] = useState<Veiculo[]>(["VAGONETA", "VAGAO"]);
  const [etapas, setEtapas] = useState<EtapaCfg[]>([]);
  const [produtos, setProdutos] = useState<ProdutoCfg[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/pcp/cargas-movimentacao").then((r) => r.json()).then((j) => {
      setVeiculos(j.veiculos ?? ["VAGONETA", "VAGAO"]);
      setEtapas(j.etapas ?? []);
      setProdutos(j.produtos ?? []);
    }).catch(() => setMsg({ ok: false, text: "Erro ao carregar" })).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  const toggleEtapa = (etapa: string, v: Veiculo, on: boolean) =>
    setEtapas((prev) => prev.map((e) => e.etapa === etapa ? { ...e, veiculos: on ? [...e.veiculos, v] : e.veiculos.filter((x) => x !== v) } : e));
  const setCap = (itemId: string, v: Veiculo, val: string) =>
    setProdutos((prev) => prev.map((p) => p.itemId === itemId ? { ...p, capacidades: { ...p.capacidades, [v]: val === "" ? null : Number(val) } } : p));

  async function salvar() {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/pcp/cargas-movimentacao", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          etapas: etapas.map((e) => ({ etapa: e.etapa, veiculos: e.veiculos })),
          produtos: produtos.map((p) => ({ itemId: p.itemId, capacidades: p.capacidades })),
        }),
      });
      if (!r.ok) { const j = await r.json(); throw new Error(j?.error ?? "Erro"); }
      setMsg({ ok: true, text: "Configuração salva." });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Erro ao salvar" }); } finally { setSaving(false); }
  }

  return (
    <div>
      <PageHeader
        title="Cargas de Movimentação"
        subtitle="Capacidade de carga por produto/veículo (vagoneta e vagão) e quais veículos cada etapa usa."
        breadcrumbs={[{ label: "PCP" }, { label: "Cargas de Movimentação" }]}
        action={
          <button onClick={salvar} disabled={saving || loading} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
          </button>
        }
      />

      <div className="px-8 pb-8 max-w-4xl space-y-5">
        {msg && <div className={`rounded-lg border px-3 py-2 text-sm ${msg.ok ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger"}`}>{msg.text}</div>}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-10"><RefreshCw className="w-4 h-4 animate-spin" /> Carregando…</div>
        ) : (
          <>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Truck className="w-4 h-4 text-cyan-600" /> Veículo por etapa</CardTitle></CardHeader>
              <CardContent>
                {etapas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma etapa (publique um fluxo de produção).</p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted text-xs text-muted-foreground uppercase">
                        <tr><th className="text-left px-3 py-2 font-semibold">Etapa</th>{veiculos.map((v) => <th key={v} className="text-center px-3 py-2 font-semibold w-28">{VEIC_LABEL[v]}</th>)}</tr>
                      </thead>
                      <tbody>
                        {etapas.map((e) => (
                          <tr key={e.etapa} className="border-t border-border">
                            <td className="px-3 py-2 text-foreground">{e.etapa}</td>
                            {veiculos.map((v) => (
                              <td key={v} className="text-center px-3 py-2">
                                <input type="checkbox" className="rounded" checked={e.veiculos.includes(v)} onChange={(ev) => toggleEtapa(e.etapa, v, ev.target.checked)} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Capacidade por produto (peças/veículo)</CardTitle></CardHeader>
              <CardContent>
                {produtos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum produto vendável com engenharia.</p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted text-xs text-muted-foreground uppercase">
                        <tr><th className="text-left px-3 py-2 font-semibold">Produto</th>{veiculos.map((v) => <th key={v} className="text-right px-3 py-2 font-semibold w-32">{VEIC_LABEL[v]}</th>)}</tr>
                      </thead>
                      <tbody>
                        {produtos.map((p) => (
                          <tr key={p.itemId} className="border-t border-border">
                            <td className="px-3 py-2"><span className="font-mono text-xs text-muted-foreground">{p.codigo}</span> · {p.descricao}</td>
                            {veiculos.map((v) => (
                              <td key={v} className="px-3 py-2 text-right">
                                <input inputMode="numeric" value={p.capacidades[v] ?? ""} onChange={(ev) => setCap(p.itemId, v, ev.target.value)} placeholder="—"
                                  className="w-24 h-8 rounded-md border border-border px-2 text-right tabular-nums bg-card" />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
