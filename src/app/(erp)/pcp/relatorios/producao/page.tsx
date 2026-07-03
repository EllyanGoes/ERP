"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import DatePicker from "@/components/shared/DatePicker";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import PrintButton from "@/components/shared/PrintButton";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { Loader2, Factory, RefreshCw } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, LabelList } from "recharts";

// Cores do gráfico (par validado p/ daltonismo e contraste nos 2 temas):
// produzido = ciano do PCP; perda = âmbar (mesma semântica das tabelas).
const COR_PRODUZIDO = "#0891b2";
const COR_PERDA = "#d97706";

type ProdutoLinha = { itemId: string; codigo: string; descricao: string; pecas: number; perda: number; ops: number };
type AreaLinha = { area: string; sequencia: number; ops: number; pecas: number; perda: number; vagoes: number | null; vagonetas: number | null; produtos: ProdutoLinha[] };
type FluxoOpt = { id: string; nome: string };

const n = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const hoje = () => new Date().toISOString().slice(0, 10);
const inicioMes = () => `${new Date().toISOString().slice(0, 8)}01`;
// % de perda sobre o descarregado (produzido + perda).
const pctPerda = (pecas: number, perda: number) => {
  const base = pecas + perda;
  return base > 0 && perda > 0 ? `${((perda / base) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—";
};

export default function RelatorioProducaoPage() {
  useTabTitle("Relatório de Produção");
  const [fluxos, setFluxos] = useState<FluxoOpt[]>([]);
  const [fluxoId, setFluxoId] = usePersistedState("rel-producao-fluxo", "");
  const [from, setFrom] = useState(inicioMes());
  const [to, setTo] = useState(hoje());
  const [areas, setAreas] = useState<AreaLinha[] | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    fetch("/api/pcp/fluxos").then((r) => r.json()).then((j) => setFluxos((j.data ?? []).map((f: { id: string; nome: string }) => ({ id: f.id, nome: f.nome })))).catch(() => {});
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const params = new URLSearchParams();
      if (fluxoId) params.set("fluxoId", fluxoId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const r = await fetch(`/api/pcp/relatorios/producao?${params.toString()}`);
      const j = await r.json();
      setAreas(j.data ?? []);
    } finally { setCarregando(false); }
  }, [fluxoId, from, to]);
  useEffect(() => { carregar(); }, [carregar]);

  const totalPecas = (areas ?? []).reduce((s, a) => s + a.pecas, 0);
  const totalPerda = (areas ?? []).reduce((s, a) => s + a.perda, 0);

  return (
    <div>
      <PageHeader
        title="Relatório de Produção"
        subtitle="Produção entregue (etapas concluídas) por área de produção, em peças"
        breadcrumbs={[{ label: "PCP" }, { label: "Relatórios" }, { label: "Produção" }]}
        actions={<div className="no-print"><PrintButton /></div>}
      />

      <div className="px-8 pb-10 space-y-4">
        {/* Filtros */}
        <div className="no-print flex flex-wrap items-end gap-3">
          <div className="min-w-[15rem]">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Fluxo de produção</label>
            <ComboboxWithCreate value={fluxoId} onChange={setFluxoId} allowNone noneLabel="Todos os fluxos" triggerClassName="h-9 rounded-lg"
              options={fluxos.map((f) => ({ value: f.id, label: f.nome }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">De</label>
            <DatePicker value={from} onChange={(v) => setFrom(v ?? "")} className="h-9" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Até</label>
            <DatePicker value={to} onChange={(v) => setTo(v ?? "")} className="h-9" />
          </div>
          <button onClick={carregar} className="h-9 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:bg-muted">
            <RefreshCw className={carregando ? "w-4 h-4 animate-spin" : "w-4 h-4"} /> Atualizar
          </button>
        </div>

        {/* Área imprimível */}
        <div className="print-area space-y-4">
          {carregando && areas === null ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : !areas || areas.length === 0 ? (
            <div className="rounded-xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
              Nenhuma etapa concluída no período/fluxo selecionado.
            </div>
          ) : (
            <>
              {/* Total geral */}
              <div className="flex flex-wrap gap-3">
                <div className="rounded-xl border border-border bg-card px-4 py-3 min-w-[12rem]">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Produzido no período</p>
                  <p className="text-xl font-bold tabular-nums text-foreground">{n(totalPecas)} <span className="text-xs font-normal text-muted-foreground">pç</span></p>
                </div>
                <div className="rounded-xl border border-border bg-card px-4 py-3 min-w-[12rem]">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Perda</p>
                  <p className="text-xl font-bold tabular-nums text-amber-600">{n(totalPerda)} <span className="text-xs font-normal text-muted-foreground">pç · {pctPerda(totalPecas, totalPerda)}</span></p>
                </div>
              </div>

              {/* Gráfico: produzido × perda por área (barras horizontais empilhadas). */}
              <div className="rounded-xl border border-border bg-card px-4 pt-4 pb-2" style={{ breakInside: "avoid" }}>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Produção por área (pç)</p>
                <ResponsiveContainer width="100%" height={Math.max(160, areas.length * 44 + 60)}>
                  <BarChart
                    layout="vertical"
                    data={areas.map((a) => ({ area: a.area, Produzido: a.pecas, Perda: a.perda, total: a.pecas + a.perda }))}
                    margin={{ top: 4, right: 56, bottom: 4, left: 8 }}
                  >
                    <CartesianGrid horizontal={false} stroke="#94a3b8" strokeOpacity={0.18} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v: number) => v.toLocaleString("pt-BR", { notation: v >= 10000 ? "compact" : "standard" })} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="area" width={130} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: "#94a3b8", fillOpacity: 0.08 }}
                      formatter={(v) => `${Number(v).toLocaleString("pt-BR")} pç`}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Legend formatter={(v: string) => <span style={{ color: "#64748b", fontSize: 12 }}>{v}</span>} />
                    <Bar dataKey="Produzido" stackId="a" fill={COR_PRODUZIDO} barSize={22} />
                    <Bar dataKey="Perda" stackId="a" fill={COR_PERDA} barSize={22} radius={[0, 4, 4, 0]}>
                      <LabelList dataKey="total" position="right" formatter={(v: React.ReactNode) => Number(v).toLocaleString("pt-BR")} style={{ fill: "#64748b", fontSize: 11 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {areas.map((a) => (
                <div key={a.area} className="rounded-xl border border-border bg-card overflow-hidden" style={{ breakInside: "avoid" }}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 border-b border-border bg-muted/60">
                    <h2 className="font-bold text-sm text-foreground uppercase tracking-wide flex items-center gap-2">
                      <Factory className="w-4 h-4 text-cyan-600" /> {a.area}
                    </h2>
                    <span className="text-xs text-muted-foreground">{a.ops} OP(s)</span>
                    <div className="ml-auto flex items-center gap-4 text-xs tabular-nums">
                      <span className="text-foreground font-semibold">{n(a.pecas)} pç</span>
                      <span className="text-amber-600">perda {n(a.perda)} pç ({pctPerda(a.pecas, a.perda)})</span>
                      {a.vagoes ? <span className="text-muted-foreground">{a.vagoes} vagões</span> : null}
                      {a.vagonetas ? <span className="text-muted-foreground">{a.vagonetas} vagonetas</span> : null}
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                        <th className="px-5 py-2 font-semibold">Produto</th>
                        <th className="px-3 py-2 font-semibold text-right">OPs</th>
                        <th className="px-3 py-2 font-semibold text-right">Produzido (pç)</th>
                        <th className="px-3 py-2 font-semibold text-right">Perda (pç)</th>
                        <th className="px-5 py-2 font-semibold text-right">% perda</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.produtos.map((p) => (
                        <tr key={p.itemId} className="border-b border-border/60 last:border-0">
                          <td className="px-5 py-2"><span className="font-mono text-xs text-muted-foreground mr-2">{p.codigo}</span>{p.descricao}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{p.ops}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{n(p.pecas)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-amber-600">{p.perda ? n(p.perda) : "—"}</td>
                          <td className="px-5 py-2 text-right tabular-nums text-amber-600">{pctPerda(p.pecas, p.perda)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
