"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import CriticidadeBadge from "@/components/pcm/CriticidadeBadge";
import DetalheOs from "@/components/pcm/DetalheOs";
import { cn } from "@/lib/utils";
import { useRelatorioCache } from "@/lib/use-relatorio-cache";
import { RefreshCw, AlertTriangle, ClipboardCheck, X } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { MtbfMttrResponse } from "@/app/api/pcm/ativo-saude/mtbf-mttr/route";

const numFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

// Marcador "✓ sem falhas": meses com zero falhas não têm MTBF/MTTR (não existe
// intervalo entre falhas para medir) — em vez de ponto vazio, um check verde
// na linha de base deixa claro que o vazio é boa notícia, não falta de dado.
function DotSemFalhas(props: { cx?: number; cy?: number; payload?: { falhas?: number } }) {
  const { cx, cy, payload } = props;
  if (payload?.falhas !== 0 || cx == null || cy == null) return null;
  return (
    <g transform={`translate(${cx},${cy - 10})`}>
      <circle r={8} fill="#dcfce7" stroke="#16a34a" strokeWidth={1.5} />
      <text textAnchor="middle" dy={3.5} fontSize={10} fill="#16a34a" fontWeight={700}>✓</text>
    </g>
  );
}
const fmtH = (n: number | null) => (n === null || n === undefined ? "—" : `${numFmt.format(n)} h`);
type Filtro = "all" | "A" | "B" | "C";

function compStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function AtivoSaudePage() {
  useTabTitle("MTBF / MTTR");

  const now = new Date();
  const [de, setDe] = useState(compStr(new Date(now.getFullYear(), now.getMonth() - 11, 1)));
  const [ate, setAte] = useState(compStr(now));
  const [filtro, setFiltro] = useState<Filtro>("all");
  const [codApl, setCodApl] = useState<number | null>(null);
  const [ativoOpts, setAtivoOpts] = useState<{ codApl: number; descricao: string; tag: string }[]>([]);

  const params = new URLSearchParams({ de, ate });
  if (filtro !== "all") params.set("criticidade", filtro);
  if (codApl !== null) params.set("codApl", String(codApl));
  const { data, loading, erro, recarregar } = useRelatorioCache<MtbfMttrResponse>(
    `/api/pcm/ativo-saude/mtbf-mttr?${params.toString()}`
  );
  // popup de timeline: ativo clicado na tabela + mês selecionado dentro do período
  const [timelineAtivo, setTimelineAtivo] = useState<{ codApl: number; descricao: string; tag: string } | null>(null);
  const [timelineComp, setTimelineComp] = useState<string>(""); // "YYYY-MM" 
  // séries ocultadas pelo clique na legenda do gráfico (menos poluição visual)
  const [seriesOcultas, setSeriesOcultas] = useState<Set<string>>(new Set());

  // Mantém a lista do seletor de ativos completa (visão sem filtros)
  useEffect(() => {
    if (data && codApl === null && filtro === "all") {
      setAtivoOpts(
        data.porAtivo
          .map((a) => ({ codApl: a.codApl, descricao: a.descricao || a.tag, tag: a.tag }))
          .sort((x, y) => x.descricao.localeCompare(y.descricao, "pt-BR")),
      );
    }
  }, [data, codApl, filtro]);

  const serie = data?.serie ?? [];
  const mesesPeriodo = serie.map((m) => ({ competencia: m.competencia, label: m.label }));
  const porAtivo = data?.porAtivo ?? [];
  const totais = data?.totais;
  const vazio = !loading && !erro && serie.length === 0;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="MTBF / MTTR"
        subtitle="Ativo Saúde — confiabilidade com base nos meses já fechados. MTBF = (funcionamento − parada não planejada) / falhas; MTTR = parada / falhas."
        breadcrumbs={[{ label: "PCM" }, { label: "Ativo Saúde" }, { label: "MTBF / MTTR" }]}
      />

      {/* Toolbar */}
      <div className="px-8 pb-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          De
          <input
            type="month"
            value={de}
            max={ate}
            onChange={(e) => setDe(e.target.value)}
            className="rounded-lg border border-border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          até
          <input
            type="month"
            value={ate}
            min={de}
            onChange={(e) => setAte(e.target.value)}
            className="rounded-lg border border-border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          Ativo
          <ComboboxWithCreate
            value={codApl === null ? "" : String(codApl)}
            onChange={(v) => {
              setCodApl(v ? Number(v) : null);
              if (v) setFiltro("all"); // ao focar um ativo, a criticidade não se aplica
            }}
            noneLabel="Todos os ativos"
            triggerClassName="h-9 rounded-lg max-w-[240px]"
            options={ativoOpts.map((a) => ({ value: String(a.codApl), label: `${a.descricao}${a.tag ? ` (${a.tag})` : ""}` }))}
          />
        </label>
        <div className="flex items-center gap-1.5">
          {(["all", "A", "B", "C"] as Filtro[]).map((f) => (
            <button
              key={f}
              type="button"
              disabled={codApl !== null}
              onClick={() => setFiltro(f)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                filtro === f ? "bg-blue-600 text-white border-blue-600" : "bg-card text-muted-foreground border-border hover:bg-muted",
                codApl !== null && "opacity-40 cursor-not-allowed hover:bg-card",
              )}
            >
              {f === "all" ? "Todos" : <>Criticidade {f}</>}
            </button>
          ))}
        </div>
        <Link
          href="/pcm/ativo-saude/fechamento"
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          <ClipboardCheck className="w-4 h-4" /> Fechamento mensal
        </Link>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto px-8 pb-8 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Carregando…
          </div>
        ) : erro ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-warning/10 flex items-center justify-center mb-3">
              <AlertTriangle className="w-7 h-7 text-amber-400" />
            </div>
            <p className="text-sm font-medium text-foreground">{erro}</p>
            <button
              type="button"
              onClick={recarregar}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <RefreshCw className="w-4 h-4" /> Tentar novamente
            </button>
          </div>
        ) : vazio ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-3">
              <ClipboardCheck className="w-7 h-7 text-muted-foreground/60" />
            </div>
            <p className="text-sm font-medium text-foreground">Nenhum mês fechado no período</p>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              O relatório só considera meses validados. Faça o fechamento mensal primeiro.
            </p>
            <Link
              href="/pcm/ativo-saude/fechamento"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <ClipboardCheck className="w-4 h-4" /> Ir para o fechamento
            </Link>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="MTBF médio" value={fmtH(totais?.mtbf ?? null)} cls="text-info" />
              <Kpi label="MTTR médio" value={fmtH(totais?.mttr ?? null)} cls="text-foreground" />
              <Kpi label="Falhas no período" value={String(totais?.falhas ?? 0)} cls="text-foreground" />
              <Kpi label="Parada não planejada" value={fmtH(totais?.horasParada ?? null)} cls="text-foreground" />
            </div>

            {/* Gráfico */}
            <div className="bg-card rounded-xl border border-border shadow-sm p-4">
              <p className="text-sm font-medium text-foreground mb-3">MTBF e MTTR por mês (horas)</p>
              <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                  <LineChart data={serie} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    {/* MTBF (centenas de horas) à esquerda; MTTR (poucas horas) à
                        direita com escala própria — na mesma escala ele virava
                        uma linha achatada impossível de acompanhar */}
                    <YAxis yAxisId="mtbf" tick={{ fontSize: 12, fill: "#2563eb" }} stroke="#2563eb" />
                    <YAxis yAxisId="mttr" orientation="right" tick={{ fontSize: 12, fill: "#d97706" }} stroke="#d97706" />
                    <Tooltip
                      formatter={(v, name) =>
                        name === "Sem falhas"
                          ? ["nenhuma falha no mês ✓", "Status"]
                          : name === "MTTR"
                          ? [`${numFmt.format(Number(v))} h (${Math.round(Number(v) * 60)} min)`, name]
                          : [`${numFmt.format(Number(v))} h`, name]
                      }
                    />
                    <Legend
                      onClick={(e) => {
                        const nome = String(e.value);
                        setSeriesOcultas((prev) => {
                          const novo = new Set(prev);
                          if (novo.has(nome)) novo.delete(nome);
                          else novo.add(nome);
                          return novo;
                        });
                      }}
                      formatter={(value) => (
                        <span style={{ cursor: "pointer", opacity: seriesOcultas.has(String(value)) ? 0.35 : 1 }}>
                          {value}
                        </span>
                      )}
                    />
                    <Line yAxisId="mtbf" type="monotone" dataKey="mtbf" name="MTBF" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} connectNulls hide={seriesOcultas.has("MTBF")} />
                    <Line yAxisId="mttr" type="monotone" dataKey="mttr" name="MTTR" stroke="#d97706" strokeWidth={2} dot={{ r: 3 }} connectNulls hide={seriesOcultas.has("MTTR")} />
                    {/* meses sem falha: só o check verde na base (linha invisível) */}
                    <Line
                      yAxisId="mttr"
                      dataKey={(d: { falhas?: number }) => (d.falhas === 0 ? 0 : null)}
                      name="Sem falhas"
                      stroke="#16a34a"
                      strokeWidth={0}
                      legendType="circle"
                      dot={<DotSemFalhas />}
                      activeDot={false}
                      isAnimationActive={false}
                      hide={seriesOcultas.has("Sem falhas")}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tabela por ativo */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-muted text-xs text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Ativo</th>
                    <th className="text-center font-medium px-2 py-2 w-12">Crit.</th>
                    <th className="text-right font-medium px-2 py-2 w-20">Falhas</th>
                    <th className="text-right font-medium px-2 py-2 w-28">Parada</th>
                    <th className="text-right font-medium px-2 py-2 w-32">Funcionamento</th>
                    <th className="text-right font-medium px-2 py-2 w-24">MTBF</th>
                    <th className="text-right font-medium px-2 py-2 w-24">MTTR</th>
                    <th className="text-right font-medium px-3 py-2 w-20">Meses</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {porAtivo.map((a) => (
                    <tr
                      key={a.codApl}
                      className="cursor-pointer hover:bg-info/10 transition-colors"
                      title="Clique para ver a timeline e as ocorrências do ativo"
                      onClick={() => {
                        setTimelineAtivo({ codApl: a.codApl, descricao: a.descricao, tag: a.tag });
                        setTimelineComp(mesesPeriodo[mesesPeriodo.length - 1]?.competencia ?? "");
                      }}
                    >
                      <td className="px-3 py-2">
                        <div className="text-foreground truncate max-w-[280px]" title={a.descricao}>{a.descricao}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{a.tag}</div>
                      </td>
                      <td className="px-2 py-2 text-center">
                        {a.criticidade ? <CriticidadeBadge value={a.criticidade} /> : <span className="text-muted-foreground/60">—</span>}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-foreground">{a.falhas}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{fmtH(a.horasParada)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                        {fmtH(a.horasFuncionamento)}
                        {a.meses > 1 && (
                          <div className="text-[11px] text-muted-foreground">média {fmtH(a.horasFuncionamento / a.meses)}/mês</div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums font-semibold text-info">{fmtH(a.mtbf)}</td>
                      <td
                        className="px-2 py-2 text-right tabular-nums font-semibold text-foreground"
                        title={a.mttr != null ? `${Math.round(a.mttr * 60)} min por OS` : undefined}
                      >
                        {fmtH(a.mttr)}
                        {a.mttr != null && (
                          <div className="text-[11px] text-muted-foreground font-normal">{Math.round(a.mttr * 60)} min</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{a.meses}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── Popup: timeline do ativo (mesma visão do fechamento) ───────────────
          Todos os meses do período são montados de uma vez (pré-carregados em
          paralelo); as pílulas só alternam a visibilidade — trocar de mês é
          instantâneo. "Período completo" mostra todos empilhados. */}
      {timelineAtivo && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3" onClick={() => setTimelineAtivo(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-[96vw] max-w-[1600px] h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground truncate">{timelineAtivo.descricao}</h2>
                <p className="text-[11px] text-muted-foreground font-mono">{timelineAtivo.tag}</p>
              </div>
              <div className="flex items-center gap-1 overflow-x-auto">
                <button
                  onClick={() => setTimelineComp("todos")}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap transition-colors",
                    timelineComp === "todos"
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-card text-muted-foreground border-border hover:bg-muted"
                  )}
                >
                  Período completo
                </button>
                {mesesPeriodo.map((m) => (
                  <button
                    key={m.competencia}
                    onClick={() => setTimelineComp(m.competencia)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap transition-colors",
                      timelineComp === m.competencia
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-card text-muted-foreground border-border hover:bg-muted"
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <button onClick={() => setTimelineAtivo(null)} className="text-muted-foreground hover:text-muted-foreground shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 bg-muted/60">
              {mesesPeriodo.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Sem meses fechados no período.</p>
              ) : (
                <div className="space-y-8">
                  {mesesPeriodo.map((m) => (
                    <div
                      key={m.competencia}
                      className={cn(
                        timelineComp !== "todos" && timelineComp !== m.competencia && "hidden"
                      )}
                    >
                      {timelineComp === "todos" && (
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{m.label}</p>
                      )}
                      <DetalheOs
                        codApl={timelineAtivo.codApl}
                        ano={Number(m.competencia.split("-")[0])}
                        mes={Number(m.competencia.split("-")[1])}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="bg-card rounded-xl border border-border shadow-sm px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-bold mt-0.5 tabular-nums", cls)}>{value}</p>
    </div>
  );
}
