"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  Settings2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Database,
  ShieldCheck,
  HelpCircle,
  Info,
} from "lucide-react";
import Link from "next/link";
import {
  Tooltip as UITooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import type { IndicadoresResponse } from "@/app/api/pcm/indicadores/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmt1(n: number) { return n.toFixed(1); }
function fmtPct(n: number) { return `${n.toFixed(1)}%`; }

const LS_TARGETS_KEY   = "pcm_targets_v1";
const LS_CACHE_KEY     = "pcm_indicadores_cache_v2";
const CACHE_MAX_AGE_MS = 30 * 60 * 1000;

let _dashMemCache: { data: IndicadoresResponse; dias: number } | null = null;

function loadTargets(): { mtbf: number; mttr: number } {
  if (typeof window === "undefined") return { mtbf: 120, mttr: 4 };
  try {
    const raw = localStorage.getItem(LS_TARGETS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { mtbf: 120, mttr: 4 };
}
function saveTargets(t: { mtbf: number; mttr: number }) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_TARGETS_KEY, JSON.stringify(t));
}

type CacheEntry = { data: IndicadoresResponse; dias: number; savedAt: string };
function saveDataCache(data: IndicadoresResponse, dias: number) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify({ data, dias, savedAt: new Date().toISOString() } satisfies CacheEntry));
  } catch {}
}
function loadDataCache(dias: number): { data: IndicadoresResponse; stale: boolean } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (entry.dias !== dias) return null;
    const age = Date.now() - new Date(entry.savedAt).getTime();
    return { data: entry.data, stale: age > CACHE_MAX_AGE_MS };
  } catch { return null; }
}
function getCachedData(dias: number): IndicadoresResponse | null {
  if (_dashMemCache?.dias === dias) return _dashMemCache.data;
  const ls = loadDataCache(dias);
  if (ls) { _dashMemCache = { data: ls.data, dias }; return ls.data; }
  return null;
}
function setCachedData(data: IndicadoresResponse, dias: number) {
  _dashMemCache = { data, dias };
  saveDataCache(data, dias);
}

function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
}
function fmtHoras(h: number): string {
  if (h <= 0) return "0h";
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const r = Math.round(h % 24);
    return r > 0 ? `${d}d ${r}h` : `${d}d`;
  }
  return `${h.toFixed(1)}h`;
}

// ---------------------------------------------------------------------------
// Metric chart configs — MTBF · MTTR · Disponibilidade · Confiabilidade
// ---------------------------------------------------------------------------
type MetricKey = "mtbfMedio" | "mttrMedio" | "disponibilidade" | "confiabilidade";

interface MetricConfig {
  key: MetricKey;
  label: string;
  color: string;
  fmtY: (v: number) => string;
  fmtDot: (v: number) => string;
  domain?: [number | "auto" | "dataMin", number | "auto" | "dataMax"];
}

const METRIC_CONFIGS: MetricConfig[] = [
  { key: "disponibilidade", label: "Disponibilidade",  color: "#22c55e", fmtY: (v) => `${v.toFixed(1)}%`, fmtDot: (v) => `${v.toFixed(2)}%`, domain: ["auto", "dataMax"] },
  { key: "confiabilidade",  label: "Confiabilidade",   color: "#3b82f6", fmtY: (v) => `${v.toFixed(1)}%`, fmtDot: (v) => `${v.toFixed(2)}%`, domain: ["auto", "dataMax"] },
  { key: "mtbfMedio",       label: "MTBF",             color: "#14b8a6", fmtY: fmtHoras, fmtDot: fmtHoras, domain: ["auto", "dataMax"] },
  { key: "mttrMedio",       label: "MTTR",             color: "#f59e0b", fmtY: fmtHoras, fmtDot: fmtHoras, domain: ["auto", "dataMax"] },
];

// ---------------------------------------------------------------------------
// LabeledDot
// ---------------------------------------------------------------------------
function LabeledDot(props: { cx?: number; cy?: number; value?: number; fmtDot: (v: number) => string; color: string }) {
  const { cx = 0, cy = 0, value = 0, fmtDot, color } = props;
  return (
    <g>
      <circle cx={cx} cy={cy} r={5} fill={color} stroke="white" strokeWidth={2} />
      <text x={cx} y={cy - 10} textAnchor="middle" fontSize={10} fontWeight={600} fill="#374151">
        {fmtDot(value)}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Info Panel
// ---------------------------------------------------------------------------
const INFO_ITEMS = [
  {
    icon: HelpCircle, color: "text-blue-500", bg: "bg-blue-50",
    title: "Por que nem todos os ativos aparecem?",
    body: "O relatório exibe apenas equipamentos que tiveram ao menos 1 OS corretiva fechada no período. Para aparecer, o ativo precisa estar cadastrado em APLIC com CODAPL válido e ter pelo menos uma OS corretiva fechada vinculada.",
  },
  {
    icon: Info, color: "text-teal-500", bg: "bg-teal-50",
    title: "É necessário ter escala de trabalho pré-definida?",
    body: "Não. O cálculo usa o período selecionado (ex.: 365 dias × 24 h = 8.760 h) como base para MTBF e Disponibilidade, sem depender de calendário de turnos.",
  },
];

function InfoPanel() {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-600">Entendendo este relatório</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="divide-y divide-gray-100 bg-white">
          {INFO_ITEMS.map((item) => (
            <div key={item.title} className="flex gap-4 px-5 py-4">
              <div className={`flex-shrink-0 p-2 rounded-lg h-fit ${item.bg}`}>
                <item.icon className={`w-4 h-4 ${item.color}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800 mb-0.5">{item.title}</p>
                <p className="text-xs text-gray-500 leading-relaxed">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KpiCard
// ---------------------------------------------------------------------------
function KpiCard({
  title, value, subtitle, icon: Icon, color, bg, trend, info,
}: {
  title: string; value: string; subtitle: string; icon: React.ElementType;
  color: string; bg: string; trend?: "up" | "down" | null; info?: React.ReactNode;
}) {
  return (
    <Card className="border-gray-100">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
              {info && (
                <TooltipProvider>
                  <UITooltip>
                    <TooltipTrigger className="text-gray-400 hover:text-gray-600 flex-shrink-0 cursor-default">
                      <Info className="w-3.5 h-3.5" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">{info}</TooltipContent>
                  </UITooltip>
                </TooltipProvider>
              )}
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              {trend === "up"   && <TrendingUp   className="w-4 h-4 text-green-500" />}
              {trend === "down" && <TrendingDown  className="w-4 h-4 text-red-500"   />}
            </div>
            <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
          </div>
          <div className={`p-2 rounded-lg ${bg} flex-shrink-0 ml-2`}>
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function PCMDashboardPage() {
  const [dias, setDias]         = useState(365);
  const [data, setData]         = useState<IndicadoresResponse | null>(() => getCachedData(365));
  const [loading, setLoading]   = useState<boolean>(() => getCachedData(365) === null);
  const [engemanOffline, setEngemanOffline] = useState(false);
  const [refreshing, setRefreshing]         = useState(false);
  const [showTargets, setShowTargets]       = useState(false);
  const [targets, setTargets]               = useState<{ mtbf: number; mttr: number }>({ mtbf: 120, mttr: 4 });
  const [targetInput, setTargetInput]       = useState({ mtbf: "120", mttr: "4" });

  useEffect(() => {
    const t = loadTargets();
    setTargets(t);
    setTargetInput({ mtbf: String(t.mtbf), mttr: String(t.mttr) });
  }, []);

  const fetchData = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/pcm/indicadores?dias=${dias}`);
      if (res.status === 503) { setEngemanOffline(true); if (!background) setData(null); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: IndicadoresResponse = await res.json();
      setEngemanOffline(false);
      setData(json);
      setCachedData(json, dias);
    } catch {
      if (!background) setData(null);
    } finally {
      if (background) setRefreshing(false);
      else setLoading(false);
    }
  }, [dias]);

  useEffect(() => {
    const cached = getCachedData(dias);
    if (cached) { setData(cached); setLoading(false); fetchData(true); }
    else { setData(null); setLoading(true); fetchData(false); }
  }, [fetchData, dias]);

  // KPI averages — all equipamentos
  const kpis = useMemo(() => {
    const list = data?.equipamentos ?? [];
    if (list.length === 0) return { mtbf: 0, mttr: 0, disp: 0, conf: 0 };
    return {
      mtbf: list.reduce((s, e) => s + e.mtbf, 0)           / list.length,
      mttr: list.reduce((s, e) => s + e.mttr, 0)           / list.length,
      disp: list.reduce((s, e) => s + e.disponibilidade, 0) / list.length,
      conf: list.reduce((s, e) => s + e.confiabilidade, 0)  / list.length,
    };
  }, [data]);

  function applyTargets() {
    const t = { mtbf: Math.max(1, Number(targetInput.mtbf) || 120), mttr: Math.max(0.5, Number(targetInput.mttr) || 4) };
    setTargets(t); saveTargets(t); setShowTargets(false);
  }

  function MetricTooltip({ active, payload, label, fmtDot }: { active?: boolean; payload?: any[]; label?: string; fmtDot: (v: number) => string }) {
    if (active && payload?.length) {
      return (
        <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow text-xs">
          <p className="font-semibold text-gray-600 mb-1">{label}</p>
          {payload.map((p: any) => (
            <p key={p.dataKey} style={{ color: p.color }} className="font-bold text-sm">{fmtDot(p.value)}</p>
          ))}
        </div>
      );
    }
    return null;
  }

  return (
    <div>
      <PageHeader
        title="Resultados"
        subtitle="Planejamento e Controle de Manutenção — MTBF · MTTR · Confiabilidade"
        breadcrumbs={[{ label: "Menu" }, { label: "PCM" }, { label: "Dashboard" }]}
        actions={
          <div className="flex items-center gap-2">
            {data?.generatedAt && (
              <span className="text-xs text-gray-400 hidden sm:block">
                Atualizado às {fmtTime(data.generatedAt)}
              </span>
            )}
            {engemanOffline ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border bg-red-50 border-red-200 text-red-700">
                <Database className="w-3.5 h-3.5" />
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Engeman inacessível
              </div>
            ) : data && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border bg-green-50 border-green-200 text-green-700">
                <Database className="w-3.5 h-3.5" />
                <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.6)]" />
                Engeman online
              </div>
            )}
            <Link href="/pcm/qualidade">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                Qualidade dos dados
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => setShowTargets((v) => !v)} className="gap-1">
              <Settings2 className="w-4 h-4" />
              Metas
            </Button>
            <Button variant="outline" size="sm" onClick={() => fetchData(false)} disabled={loading || refreshing} className="gap-1">
              <RefreshCw className={`w-4 h-4 ${loading || refreshing ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        }
      />

      <div className="px-8 pb-8 space-y-6">

        {/* Target config panel */}
        {showTargets && (
          <Card className="border-blue-100 bg-blue-50/30">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-end gap-6">
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-3">Configuração de Metas</p>
                  <div className="flex items-end gap-4">
                    <div>
                      <Label className="text-xs text-gray-500 mb-1 block">Meta MTBF (horas)</Label>
                      <Input type="number" value={targetInput.mtbf} onChange={(e) => setTargetInput((t) => ({ ...t, mtbf: e.target.value }))} className="w-28 h-8 text-sm" min={1} />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500 mb-1 block">Meta MTTR (horas)</Label>
                      <Input type="number" value={targetInput.mttr} onChange={(e) => setTargetInput((t) => ({ ...t, mttr: e.target.value }))} className="w-28 h-8 text-sm" min={0.5} step={0.5} />
                    </div>
                    <Button size="sm" onClick={applyTargets}>Aplicar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowTargets(false)}>Cancelar</Button>
                  </div>
                </div>
                <div className="text-xs text-gray-400 ml-auto">Valores salvos no navegador (localStorage)</div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Período */}
        <div className="flex items-end gap-3">
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Período</Label>
            <Select value={String(dias)} onValueChange={(v) => setDias(Number(v))}>
              <SelectTrigger className="w-44 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
                <SelectItem value="180">Últimos 180 dias</SelectItem>
                <SelectItem value="365">Últimos 12 meses</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* KPI Cards — 4 colunas */}
        <div className="grid grid-cols-4 gap-4">
          <KpiCard
            title="Média MTBF"
            value={`${fmt1(kpis.mtbf)}h`}
            subtitle={`Meta: ${targets.mtbf}h entre falhas`}
            icon={Activity}
            color={kpis.mtbf >= targets.mtbf ? "text-blue-600" : "text-red-600"}
            bg={kpis.mtbf >= targets.mtbf ? "bg-blue-50" : "bg-red-50"}
            trend={kpis.mtbf >= targets.mtbf ? "up" : "down"}
            info={<span><strong>MTBF</strong> — Tempo Médio Entre Falhas<br />Período ÷ nº de falhas com defeito registrado (CODDEF IS NOT NULL).</span>}
          />
          <KpiCard
            title="Média MTTR"
            value={`${fmt1(kpis.mttr)}h`}
            subtitle={`Meta: ≤ ${targets.mttr}h para reparar`}
            icon={AlertTriangle}
            color={kpis.mttr <= targets.mttr ? "text-green-600" : "text-red-600"}
            bg={kpis.mttr <= targets.mttr ? "bg-green-50" : "bg-red-50"}
            trend={kpis.mttr <= targets.mttr ? "up" : "down"}
            info={<span><strong>MTTR</strong> — Tempo Médio Para Reparar<br />Horas totais de reparo ÷ nº de falhas. Usa MAQPAR→MAQFUN ou HOREXEREA.</span>}
          />
          <KpiCard
            title="Disponibilidade Média"
            value={fmtPct(kpis.disp)}
            subtitle="MTBF / (MTBF + MTTR) × 100"
            icon={TrendingUp}
            color={kpis.disp >= 95 ? "text-green-600" : kpis.disp >= 85 ? "text-amber-600" : "text-red-600"}
            bg={kpis.disp >= 95 ? "bg-green-50" : kpis.disp >= 85 ? "bg-amber-50" : "bg-red-50"}
            trend={kpis.disp >= 90 ? "up" : "down"}
            info={<span><strong>Disponibilidade</strong><br />MTBF ÷ (MTBF + MTTR) × 100. Representa o percentual do período em que os equipamentos estavam operacionais.</span>}
          />
          <KpiCard
            title="Confiabilidade Média"
            value={fmtPct(kpis.conf)}
            subtitle="Probabilidade de operar 90 dias sem falha"
            icon={Activity}
            color={kpis.conf >= 60 ? "text-blue-600" : "text-amber-600"}
            bg={kpis.conf >= 60 ? "bg-blue-50" : "bg-amber-50"}
            trend={kpis.conf >= 60 ? "up" : "down"}
            info={<span><strong>Confiabilidade R(90d)</strong><br />EXP(−n ÷ 8760 × 2160) × 100 — fórmula Engeman nativa. n = OS com DEFCAU=&apos;S&apos; nos últimos 365 dias.</span>}
          />
        </div>

        {/* Gráficos de Tendência */}
        {!loading && data && data.tendencia.length > 0 && (
          <div className="space-y-4">
            {METRIC_CONFIGS.map((cfg) => (
              <Card key={cfg.key} className="border-gray-100">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-gray-800">{cfg.label}</p>
                    <span className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded px-2 py-0.5">Mês</span>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={data.tendencia} margin={{ top: 22, right: 24, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={cfg.fmtY} width={56} domain={cfg.domain} />
                      <Tooltip
                        content={({ active, payload, label }) => (
                          <MetricTooltip active={active} payload={payload as any[]} label={typeof label === "string" ? label : String(label ?? "")} fmtDot={cfg.fmtDot} />
                        )}
                      />
                      <Line
                        type="monotone"
                        dataKey={cfg.key}
                        stroke={cfg.color}
                        strokeWidth={2.5}
                        dot={(props) => (
                          <LabeledDot key={`dot-${props.index}`} cx={props.cx} cy={props.cy} value={props.value} fmtDot={cfg.fmtDot} color={cfg.color} />
                        )}
                        activeDot={{ r: 6, fill: cfg.color, stroke: "white", strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Loading / offline states */}
        {loading && (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Carregando dados do Engeman…
          </div>
        )}
        {!loading && engemanOffline && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-sm">
            <Database className="w-10 h-10 text-red-300" />
            <p className="font-semibold text-red-600">Engeman inacessível</p>
            <p className="text-gray-400 text-center max-w-sm">
              O banco de dados do Engeman não está acessível neste ambiente.<br />
              Disponível apenas na rede local (192.168.0.206).
            </p>
            <Button variant="outline" size="sm" className="gap-1.5 mt-1" onClick={() => fetchData(false)}>
              <RefreshCw className="w-4 h-4" />
              Tentar novamente
            </Button>
          </div>
        )}

        {/* Info panel */}
        <InfoPanel />

        {/* Footer */}
        {data && (
          <p className="text-xs text-gray-400 text-right">
            Atualizado em {new Date(data.generatedAt).toLocaleString("pt-BR")} · Fonte: Engeman CMMS
          </p>
        )}

      </div>
    </div>
  );
}
