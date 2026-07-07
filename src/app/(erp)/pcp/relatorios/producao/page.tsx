"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import DatePicker from "@/components/shared/DatePicker";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import PrintButton from "@/components/shared/PrintButton";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import { Loader2, Factory, RefreshCw } from "lucide-react";
import { ResponsiveContainer, BarChart, ComposedChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, LabelList } from "recharts";

// Cores dos gráficos (pares validados p/ daltonismo e contraste nos 2 temas):
// produzido = ciano do PCP; perda = âmbar (tabelas/empilhado); quebra = vermelho (linha).
const COR_PRODUZIDO = "#0891b2";
const COR_PERDA = "#d97706";
const COR_QUEBRA = "#dc2626";
const COR_VEICULOS = "#7c3aed";

type ProdutoLinha = { itemId: string; codigo: string; descricao: string; pecas: number; paletes: number; perda: number; ops: number };
type AreaLinha = { area: string; sequencia: number; ops: number; pecas: number; paletes: number; perda: number; vagoes: number | null; vagonetas: number | null; produtos: ProdutoLinha[] };
type DiaLinha = { dia: string; area: string; pecas: number; paletes: number; perda: number; veiculos: number };
type OpDia = { dia: string; area: string; id: string; numero: string; hora: string | null; apontadoPor: string | null; pecas: number; paletes: number; perda: number; veiculos: number; produtos: string };
type FluxoOpt = { id: string; nome: string };

const n = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const n1 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const hoje = () => new Date().toISOString().slice(0, 10);
const inicioMes = () => `${new Date().toISOString().slice(0, 8)}01`;
// % de perda sobre o APONTADO REAL (produzido), não sobre o planejado/descarregado.
const pctPerda = (pecas: number, perda: number) =>
  pecas > 0 && perda > 0 ? `${((perda / pecas) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—";

export default function RelatorioProducaoPage() {
  useTabTitle("Relatório de Produção");
  const [fluxos, setFluxos] = useState<FluxoOpt[]>([]);
  const [fluxoId, setFluxoId] = usePersistedState("rel-producao-fluxo", "");
  const [from, setFrom] = useState(inicioMes());
  const [to, setTo] = useState(hoje());
  const [areas, setAreas] = useState<AreaLinha[] | null>(null);
  const [porDia, setPorDia] = useState<DiaLinha[]>([]);
  const [opsDia, setOpsDia] = useState<OpDia[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [aba, setAba] = useState<"grafico" | "areas">("grafico");
  // Área selecionada no gráfico por data ("" = todas as áreas somadas).
  const [areaSel, setAreaSel] = usePersistedState("rel-producao-area", "");
  // Dia clicado no gráfico → pop-up com o resumo das OPs.
  const [diaPopup, setDiaPopup] = useState<string | null>(null);

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
      setPorDia(j.porDia ?? []);
      setOpsDia(j.ops ?? []);
    } finally { setCarregando(false); }
  }, [fluxoId, from, to]);
  useEffect(() => { carregar(); }, [carregar]);

  const totalPecas = (areas ?? []).reduce((s, a) => s + a.pecas, 0);
  const totalPerda = (areas ?? []).reduce((s, a) => s + a.perda, 0);

  // Série do gráfico por data: um ponto por dia do período (dias sem produção
  // entram zerados p/ o eixo do tempo ser honesto), filtrada pela área escolhida.
  const serieDias = useMemo(() => {
    if (!from || !to) return [];
    const mapa = new Map<string, { pecas: number; paletes: number; perda: number; veiculos: number }>();
    for (const d of porDia) {
      if (areaSel && d.area !== areaSel) continue;
      const cur = mapa.get(d.dia) ?? { pecas: 0, paletes: 0, perda: 0, veiculos: 0 };
      cur.pecas += d.pecas; cur.paletes += d.paletes ?? 0; cur.perda += d.perda; cur.veiculos += d.veiculos;
      mapa.set(d.dia, cur);
    }
    const out: { dia: string; label: string; producao: number; paletes: number; quebra: number; veiculos: number }[] = [];
    const ini = new Date(`${from}T12:00:00`);
    const fim = new Date(`${to}T12:00:00`);
    for (let t = ini.getTime(); t <= fim.getTime() && out.length < 190; t += 86400000) {
      const iso = new Date(t).toISOString().slice(0, 10);
      const v = mapa.get(iso);
      out.push({ dia: iso, label: `${iso.slice(8, 10)}/${iso.slice(5, 7)}`, producao: v?.pecas ?? 0, paletes: v?.paletes ?? 0, quebra: v?.perda ?? 0, veiculos: v?.veiculos ?? 0 });
    }
    return out;
  }, [porDia, areaSel, from, to]);

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
          {/* Totais do período, ao lado do Atualizar. */}
          <div className="flex items-center gap-3 ml-2">
            <div className="rounded-lg border border-border bg-card px-3 py-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-tight">Produzido</p>
              <p className="text-sm font-bold tabular-nums text-foreground leading-tight">{n(totalPecas)} <span className="text-[10px] font-normal text-muted-foreground">pç</span></p>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-tight">Perda</p>
              <p className="text-sm font-bold tabular-nums text-amber-600 leading-tight">{n(totalPerda)} <span className="text-[10px] font-normal text-muted-foreground">pç · {pctPerda(totalPecas, totalPerda)}</span></p>
            </div>
          </div>
        </div>

        {/* Abas: gráfico por data (1ª) × visão por área (2ª) */}
        <div className="no-print border-b border-border">
          <div className="flex gap-0">
            {([["grafico", "Gráfico"], ["areas", "Por área"]] as const).map(([k, lbl]) => (
              <button key={k} onClick={() => setAba(k)}
                className={cn("px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                  aba === k ? "border-cyan-600 text-cyan-700 dark:text-cyan-400" : "border-transparent text-muted-foreground hover:text-foreground")}>
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* ── ABA GRÁFICO: colunas por data + linha de quebra, por área ─────── */}
        {aba === "grafico" && (
          <div className="rounded-xl border border-border bg-card px-4 pt-4 pb-2">
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              {["", ...(areas ?? []).map((a) => a.area)].map((nome) => (
                <button key={nome || "_todas"} onClick={() => setAreaSel(nome)}
                  className={cn("px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                    areaSel === nome ? "bg-cyan-600 border-cyan-600 text-white" : "border-border text-muted-foreground hover:bg-muted")}>
                  {nome || "Todas as áreas"}
                </button>
              ))}
            </div>
            {serieDias.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">Sem dados no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height={340}>
                <ComposedChart data={serieDias} margin={{ top: 8, right: 8, bottom: 4, left: 0 }} style={{ cursor: "pointer" }}
                  onClick={(e) => { const dia = (e as { activePayload?: { payload?: { dia?: string } }[] })?.activePayload?.[0]?.payload?.dia; if (dia) setDiaPopup(dia); }}>
                  <CartesianGrid vertical={false} stroke="#94a3b8" strokeOpacity={0.18} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={18} />
                  <YAxis yAxisId="pecas" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v: number) => v.toLocaleString("pt-BR", { notation: v >= 10000 ? "compact" : "standard" })} axisLine={false} tickLine={false} label={{ value: "pç", position: "insideTopLeft", offset: 0, fontSize: 10, fill: "#94a3b8" }} />
                  <YAxis yAxisId="veiculos" orientation="right" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} label={{ value: "vagões", position: "insideTopRight", offset: 0, fontSize: 10, fill: "#94a3b8" }} />
                  <Tooltip
                    cursor={{ fill: "#94a3b8", fillOpacity: 0.08 }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const p = (payload[0]?.payload ?? {}) as { producao?: number; paletes?: number; quebra?: number; veiculos?: number };
                      return (
                        <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md space-y-0.5" style={{ fontSize: 12 }}>
                          <p className="font-medium text-foreground">Dia {label} — clique na coluna p/ ver as OPs</p>
                          <p style={{ color: COR_PRODUZIDO }}>Produção: {n(p.producao ?? 0)} pç · <b>{n1(p.paletes ?? 0)} paletes</b></p>
                          <p style={{ color: COR_QUEBRA }}>Quebra: {n(p.quebra ?? 0)} pç{(p.producao ?? 0) > 0 && (p.quebra ?? 0) > 0 ? ` (${pctPerda(p.producao ?? 0, p.quebra ?? 0)})` : ""}</p>
                          <p style={{ color: COR_VEICULOS }}>Vagões descarregados: {p.veiculos ?? 0}</p>
                        </div>
                      );
                    }}
                  />
                  <Legend formatter={(v: string) => <span style={{ color: "#64748b", fontSize: 12 }}>{v}</span>} />
                  <Bar yAxisId="pecas" name="Produção" dataKey="producao" stackId="p" fill={COR_PRODUZIDO} maxBarSize={30} />
                  <Bar yAxisId="pecas" name="Quebra" dataKey="quebra" stackId="p" fill={COR_QUEBRA} radius={[4, 4, 0, 0]} maxBarSize={30} />
                  <Bar yAxisId="veiculos" name="Vagões descarregados" dataKey="veiculos" fill={COR_VEICULOS} radius={[4, 4, 0, 0]} maxBarSize={18} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* Pop-up: resumo das OPs do dia clicado no gráfico */}
        {diaPopup && (() => {
          const doDia = opsDia.filter((o) => o.dia === diaPopup && (!areaSel || o.area === areaSel));
          const tot = doDia.reduce((s, o) => ({ pecas: s.pecas + o.pecas, paletes: s.paletes + (o.paletes ?? 0), perda: s.perda + o.perda, veiculos: s.veiculos + o.veiculos }), { pecas: 0, paletes: 0, perda: 0, veiculos: 0 });
          const [y, m, d] = diaPopup.split("-");
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDiaPopup(null)}>
              <div className="w-full max-w-3xl rounded-xl border border-border bg-card p-5 shadow-xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <Factory className="w-5 h-5 text-cyan-600" /> OPs de {d}/{m}/{y}{areaSel ? ` — ${areaSel}` : ""}
                  </h2>
                  <button onClick={() => setDiaPopup(null)} className="text-muted-foreground hover:text-foreground text-sm">Fechar ✕</button>
                </div>
                <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                  {doDia.length} OP(s) · {n(tot.pecas)} pç · {n1(tot.paletes)} paletes · quebra {n(tot.perda)} pç ({pctPerda(tot.pecas, tot.perda)}){tot.veiculos ? ` · ${tot.veiculos} vagões descarregados` : ""}
                </p>
                {doDia.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma OP concluída neste dia.</p>
                ) : (
                  <div className="mt-3 rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground bg-muted border-b border-border">
                          <th className="px-3 py-1.5 font-semibold">OP</th>
                          <th className="px-3 py-1.5 font-semibold">Área</th>
                          <th className="px-3 py-1.5 font-semibold">Produtos (real)</th>
                          <th className="px-3 py-1.5 font-semibold text-right">Paletes</th>
                          <th className="px-3 py-1.5 font-semibold text-right">Quebra</th>
                          <th className="px-3 py-1.5 font-semibold text-right">Vagões</th>
                          <th className="px-3 py-1.5 font-semibold text-right">Hora</th>
                        </tr>
                      </thead>
                      <tbody>
                        {doDia.map((o) => (
                          <tr key={`${o.id}-${o.area}`} className="border-b border-border/60 last:border-0">
                            <td className="px-3 py-1.5"><a href={`/pcp/ordens/${o.id}`} className="font-mono text-cyan-600 hover:underline">{o.numero}</a></td>
                            <td className="px-3 py-1.5 text-muted-foreground">{o.area}</td>
                            <td className="px-3 py-1.5">{o.produtos || "—"}{o.apontadoPor ? <span className="text-muted-foreground"> · {o.apontadoPor}</span> : null}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{o.paletes ? n1(o.paletes) : "—"}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-amber-600">{o.perda ? n(o.perda) : "—"}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{o.veiculos || "—"}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{o.hora ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── ABA POR ÁREA (imprimível) ─────────────────────────────────────── */}
        {aba === "areas" && (
        <div className="print-area space-y-4">
          {carregando && areas === null ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : !areas || areas.length === 0 ? (
            <div className="rounded-xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
              Nenhuma etapa concluída no período/fluxo selecionado.
            </div>
          ) : (
            <>
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
                      {a.paletes ? <span className="text-muted-foreground">{n1(a.paletes)} paletes</span> : null}
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
                        <th className="px-3 py-2 font-semibold text-right">Paletes</th>
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
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{p.paletes ? n1(p.paletes) : "—"}</td>
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
        )}
      </div>
    </div>
  );
}
