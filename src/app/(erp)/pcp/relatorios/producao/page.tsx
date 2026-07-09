"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DateRangePicker, { type DateRange } from "@/components/shared/DateRangePicker";
import Dica from "@/components/shared/Dica";
import { corArea, iconeArea } from "@/lib/pcp/area-visual";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import PrintButton from "@/components/shared/PrintButton";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import { Loader2, Factory, RefreshCw } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

// Cores dos gráficos (pares validados p/ daltonismo e contraste nos 2 temas):
// produzido = ciano do PCP; perda = âmbar (tabelas/empilhado); quebra = vermelho (linha).
const COR_PRODUZIDO = "#0891b2";
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
  // Filtro de PERÍODO (1º clique = início, 2º = fim); vazio = mês atual até hoje.
  const [periodo, setPeriodo] = useState<DateRange>({ from: "", to: "" });
  const from = periodo.from || inicioMes();
  const to = periodo.to || periodo.from || hoje();
  const [areas, setAreas] = useState<AreaLinha[] | null>(null);
  const [porDia, setPorDia] = useState<DiaLinha[]>([]);
  const [opsDia, setOpsDia] = useState<OpDia[]>([]);
  const [carregando, setCarregando] = useState(false);
  // Área selecionada — as ABAS (mesmo padrão do Fluxo de Produção) escolhem a área.
  const [areaSel, setAreaSel] = usePersistedState("rel-producao-area", "");
  // Agrupamento do gráfico: colunas por dia, mês ou ano.
  const [granularidade, setGranularidade] = usePersistedState<"dia" | "mes" | "ano">("rel-producao-gran", "dia");
  // Dia clicado no gráfico → pop-up com o resumo das OPs.
  const [diaPopup, setDiaPopup] = useState<string | null>(null);
  // Séries ocultas no gráfico diário — clique na legenda esconde/mostra a série.
  const [seriesOcultas, setSeriesOcultas] = useState<Record<string, boolean>>({});
  const toggleSerie = (dataKey?: unknown) => {
    if (typeof dataKey !== "string" || !dataKey) return;
    setSeriesOcultas((s) => ({ ...s, [dataKey]: !s[dataKey] }));
  };

  useEffect(() => {
    fetch("/api/pcp/fluxos").then((r) => r.json()).then((j) => setFluxos((j.data ?? []).map((f: { id: string; nome: string }) => ({ id: f.id, nome: f.nome })))).catch(() => {});
  }, []);

  // Áreas (chips) vêm das ETAPAS DO FLUXO — ficam visíveis mesmo sem produção
  // no período (antes vinham dos dados e sumiam quando o relatório voltava vazio).
  const [areasFluxo, setAreasFluxo] = useState<string[]>([]);
  useEffect(() => {
    if (!fluxoId) { setAreasFluxo([]); return; }
    fetch(`/api/pcp/ordens/area/abas?fluxoId=${fluxoId}`)
      .then((r) => r.json())
      .then((j) => setAreasFluxo(((j.areas ?? []) as { nome: string; centroTrabalho: string | null }[]).map((a) => a.centroTrabalho ?? a.nome)))
      .catch(() => setAreasFluxo([]));
  }, [fluxoId]);

  // Chips: etapas do fluxo (estáveis) ou, sem fluxo selecionado, as áreas com dados.
  const chipsAreas = areasFluxo.length ? areasFluxo : (areas ?? []).map((a) => a.area);
  // Sem chip "Todas as áreas": garante uma área válida selecionada.
  useEffect(() => {
    if (!chipsAreas.length) return;
    if (!areaSel || !chipsAreas.includes(areaSel)) setAreaSel(chipsAreas[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chipsAreas.join("|")]);

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

  // Atualiza SOZINHO: ao voltar o foco/visibilidade para a aba e a cada 60s —
  // apontamentos feitos no Fluxo de Produção aparecem sem clicar em Atualizar.
  useEffect(() => {
    const onFocus = () => carregar();
    const onVis = () => { if (document.visibilityState === "visible") carregar(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    const t = setInterval(carregar, 60000);
    return () => { window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVis); clearInterval(t); };
  }, [carregar]);

  const totalPecas = (areas ?? []).reduce((s, a) => s + a.pecas, 0);
  const totalPerda = (areas ?? []).reduce((s, a) => s + a.perda, 0);

  // Série do gráfico agrupada por DIA, MÊS ou ANO (buckets sem produção entram
  // zerados p/ o eixo do tempo ser honesto), filtrada pela área da aba.
  const serieDias = useMemo(() => {
    if (!from || !to) return [];
    // Chave do bucket: dia = "YYYY-MM-DD"; mês = "YYYY-MM"; ano = "YYYY".
    const chave = (iso: string) => (granularidade === "ano" ? iso.slice(0, 4) : granularidade === "mes" ? iso.slice(0, 7) : iso);
    const rotulo = (k: string) => (granularidade === "ano" ? k : granularidade === "mes" ? `${k.slice(5, 7)}/${k.slice(0, 4)}` : `${k.slice(8, 10)}/${k.slice(5, 7)}`);
    const mapa = new Map<string, { pecas: number; paletes: number; perda: number; veiculos: number }>();
    for (const d of porDia) {
      if (areaSel && d.area !== areaSel) continue;
      const k = chave(d.dia);
      const cur = mapa.get(k) ?? { pecas: 0, paletes: 0, perda: 0, veiculos: 0 };
      cur.pecas += d.pecas; cur.paletes += d.paletes ?? 0; cur.perda += d.perda; cur.veiculos += d.veiculos;
      mapa.set(k, cur);
    }
    const out: { dia: string; label: string; producao: number; paletes: number; quebra: number; veiculos: number }[] = [];
    const ini = new Date(`${from}T12:00:00`);
    const fim = new Date(`${to}T12:00:00`);
    const vistos = new Set<string>();
    for (let t = ini.getTime(); t <= fim.getTime() && out.length < 190; t += 86400000) {
      const iso = new Date(t).toISOString().slice(0, 10);
      const k = chave(iso);
      if (vistos.has(k)) continue;
      vistos.add(k);
      const v = mapa.get(k);
      out.push({ dia: k, label: rotulo(k), producao: v?.pecas ?? 0, paletes: v?.paletes ?? 0, quebra: v?.perda ?? 0, veiculos: v?.veiculos ?? 0 });
    }
    return out;
  }, [porDia, areaSel, from, to, granularidade]);

  return (
    <div>
      {/* Sem PageHeader: aproveitamento de tela — o Imprimir mora na linha de filtros. */}
      <div className="px-8 pt-4 pb-10 space-y-4">
        {/* Filtros */}
        <div className="no-print flex flex-wrap items-end gap-3">
          <div className="min-w-[15rem]">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Fluxo de produção</label>
            <ComboboxWithCreate value={fluxoId} onChange={setFluxoId} allowNone noneLabel="Todos os fluxos" triggerClassName="h-9 rounded-lg"
              options={fluxos.map((f) => ({ value: f.id, label: f.nome }))} />
          </div>
          <div className="min-w-[15rem]">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Período <span className="text-muted-foreground/60">(vazio = mês atual)</span></label>
            <DateRangePicker value={periodo} onChange={setPeriodo} placeholder="Período — mês atual" />
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
          <div className="no-print ml-auto"><PrintButton /></div>
        </div>

        {/* Abas por ÁREA (mesmo padrão do Fluxo de Produção: ícone colorido +
            tooltip) + agrupamento do gráfico (dia/mês/ano) à direita. */}
        <div className="no-print flex border-b border-border">
          {chipsAreas.map((nome, i) => {
            const cor = corArea(i);
            const Icone = iconeArea(nome);
            const ativa = areaSel === nome;
            return (
              <Dica key={nome} label={nome}>
              <button onClick={() => setAreaSel(nome)}
                className={cn("px-3.5 py-2.5 border-b-2 -mb-px whitespace-nowrap transition-colors inline-flex items-center gap-1.5",
                  ativa ? cn(cor.borda, cor.txt) : "border-transparent hover:bg-muted/60")}>
                <Icone className={cn("w-5 h-5", cor.txt)} />
              </button>
              </Dica>
            );
          })}
          {/* Agrupamento das colunas do gráfico */}
          <div className="ml-auto flex items-center self-center pb-1">
            <div className="flex rounded-lg border border-border p-0.5 text-xs">
              {([["dia", "Dia"], ["mes", "Mês"], ["ano", "Ano"]] as const).map(([k, lbl]) => (
                <button key={k} type="button" onClick={() => setGranularidade(k)}
                  className={cn("px-2.5 py-1 rounded-md transition-colors", granularidade === k ? "bg-foreground text-background font-medium" : "text-muted-foreground hover:text-foreground")}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Gráfico da área selecionada ─────────────────────────────────────── */}
        {(
          <div className="rounded-xl border border-border bg-card px-4 pt-4 pb-2">
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
                          <p className="font-medium text-foreground">{granularidade === "dia" ? "Dia" : granularidade === "mes" ? "Mês" : "Ano"} {label} — clique na coluna p/ ver as OPs</p>
                          <p style={{ color: COR_PRODUZIDO }}>Produção: {n(p.producao ?? 0)} pç · <b>{n1(p.paletes ?? 0)} paletes</b></p>
                          <p style={{ color: COR_QUEBRA }}>Quebra: {n(p.quebra ?? 0)} pç{(p.producao ?? 0) > 0 && (p.quebra ?? 0) > 0 ? ` (${pctPerda(p.producao ?? 0, p.quebra ?? 0)})` : ""}</p>
                          <p style={{ color: COR_VEICULOS }}>Vagões descarregados: {p.veiculos ?? 0}</p>
                        </div>
                      );
                    }}
                  />
                  {/* Legenda CLICÁVEL: esconde/mostra a série (ex.: tirar os vagões do gráfico). */}
                  <Legend
                    onClick={(e) => toggleSerie((e as { dataKey?: unknown })?.dataKey)}
                    formatter={(v: string, entry) => {
                      const key = (entry as { dataKey?: unknown })?.dataKey;
                      const oculta = typeof key === "string" && seriesOcultas[key];
                      return <span style={{ color: oculta ? "#cbd5e1" : "#64748b", fontSize: 12, cursor: "pointer", textDecoration: oculta ? "line-through" : "none" }}>{v}</span>;
                    }}
                  />
                  <Bar yAxisId="pecas" name="Produção" dataKey="producao" stackId="p" fill={COR_PRODUZIDO} maxBarSize={30} hide={!!seriesOcultas.producao} />
                  <Bar yAxisId="pecas" name="Quebra" dataKey="quebra" stackId="p" fill={COR_QUEBRA} radius={[4, 4, 0, 0]} maxBarSize={30} hide={!!seriesOcultas.quebra} />
                  <Bar yAxisId="veiculos" name="Vagões descarregados" dataKey="veiculos" fill={COR_VEICULOS} radius={[4, 4, 0, 0]} maxBarSize={18} hide={!!seriesOcultas.veiculos} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* Pop-up: resumo das OPs do bucket clicado (dia, mês ou ano) */}
        {diaPopup && (() => {
          // Prefixo casa a granularidade: "YYYY-MM-DD" (dia), "YYYY-MM" (mês), "YYYY" (ano).
          const doDia = opsDia.filter((o) => o.dia.startsWith(diaPopup) && (!areaSel || o.area === areaSel));
          const tot = doDia.reduce((s, o) => ({ pecas: s.pecas + o.pecas, paletes: s.paletes + (o.paletes ?? 0), perda: s.perda + o.perda, veiculos: s.veiculos + o.veiculos }), { pecas: 0, paletes: 0, perda: 0, veiculos: 0 });
          const [y, m, d] = diaPopup.split("-");
          const tituloPeriodo = d ? `${d}/${m}/${y}` : m ? `${m}/${y}` : y;
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDiaPopup(null)}>
              <div className="w-full max-w-3xl rounded-xl border border-border bg-card p-5 shadow-xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <Factory className="w-5 h-5 text-cyan-600" /> OPs de {tituloPeriodo}{areaSel ? ` — ${areaSel}` : ""}
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

        {/* ── Tabela da ÁREA selecionada (imprimível), abaixo do gráfico ────── */}
        <div className="print-area space-y-4">
          {carregando && areas === null ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : !areas || areas.length === 0 ? (
            <div className="rounded-xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
              Nenhuma etapa concluída no período/fluxo selecionado.
            </div>
          ) : (
            <>
              {areas.filter((a) => a.area === areaSel).map((a) => (
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
      </div>
    </div>
  );
}
