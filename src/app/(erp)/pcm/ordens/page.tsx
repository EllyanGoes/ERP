"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  Database,
  ClipboardList,
  X,
  MapPin,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  Circle,
  ChevronRight,
  Timer,
  Cpu,
  Tag,
  CalendarCheck,
  CalendarX,
  User,
  FileText,
} from "lucide-react";
import type { OSDetalhe } from "@/app/api/pcm/ordens/[codord]/route";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type { OrdensResponse, DetalheOS, AplicacaoEmAberto } from "@/app/api/pcm/ordens/route";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────
const LS_CACHE_KEY    = "pcm_ordens_cache_v2";
const LS_FILTER_KEY   = "pcm_ordens_filters";
const CACHE_MAX_AGE_MS = 30 * 60 * 1000;

const STATUS_CONFIG: Record<string, {
  label: string;
  color: string;
  bg: string;
  border: string;
  text: string;
  Icon: React.ElementType;
}> = {
  A: { label: "Em Aberto",    color: "#3b82f6", bg: "bg-info/10",   border: "border-info/30",  text: "text-info",   Icon: AlertCircle   },
  E: { label: "Em Espera",    color: "#f59e0b", bg: "bg-warning/10",  border: "border-warning/30", text: "text-warning",  Icon: Clock         },
  P: { label: "Em Progresso", color: "#6366f1", bg: "bg-indigo-50 dark:bg-indigo-500/15", border: "border-indigo-200 dark:border-indigo-500/30",text: "text-indigo-700 dark:text-indigo-300", Icon: Circle        },
  F: { label: "Concluídas",   color: "#22c55e", bg: "bg-success/10",  border: "border-success/30", text: "text-success",  Icon: CheckCircle2  },
  C: { label: "Canceladas",   color: "#94a3b8", bg: "bg-slate-50 dark:bg-slate-500/15",  border: "border-slate-200 dark:border-slate-500/30", text: "text-slate-600 dark:text-slate-400",  Icon: XCircle       },
};

const PRIORIDADE_CONFIG: Record<string, string> = {
  ALTA:   "bg-danger/15 text-danger",
  MÉDIA:  "bg-warning/15 text-warning",
  BAIXA:  "bg-success/15 text-success",
};

// ── Types ─────────────────────────────────────────────────────────────────────
type CacheEntry = { data: OrdensResponse; dias: number; agrupamento: string; savedAt: string };

// ── Cache helpers ─────────────────────────────────────────────────────────────

// Module-level memory cache — survives tab switches within the same session
let _ordensMemCache: { data: OrdensResponse; dias: number; agrupamento: string } | null = null;

function saveCache(data: OrdensResponse, dias: number, agrupamento: string) {
  _ordensMemCache = { data, dias, agrupamento };
  if (typeof window === "undefined") return;
  try {
    const entry: CacheEntry = { data, dias, agrupamento, savedAt: new Date().toISOString() };
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify(entry));
  } catch {}
}

function loadCache(dias: number, agrupamento: string): { data: OrdensResponse; stale: boolean } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (entry.dias !== dias || entry.agrupamento !== agrupamento) return null;
    const age = Date.now() - new Date(entry.savedAt).getTime();
    return { data: entry.data, stale: age > CACHE_MAX_AGE_MS };
  } catch {
    return null;
  }
}

function getOrdensCache(dias: number, agrupamento: string): OrdensResponse | null {
  if (_ordensMemCache?.dias === dias && _ordensMemCache?.agrupamento === agrupamento)
    return _ordensMemCache.data;
  const ls = loadCache(dias, agrupamento);
  if (ls) { _ordensMemCache = { data: ls.data, dias, agrupamento }; return ls.data; }
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function statusLabel(code: string): string {
  const map: Record<string, string> = {
    A: "Em Aberto",
    E: "Em Espera",
    F: "Concluída",
    C: "Cancelada",
    P: "Em Progresso",
  };
  return map[code] ?? "Em Progresso";
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-md text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

// ── OS Detail Panel ───────────────────────────────────────────────────────────
function OSDetailPanel({
  codord,
  onClose,
}: {
  codord: number;
  onClose: () => void;
}) {
  const [detail, setDetail]     = useState<OSDetalhe | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setDetail(null);
    fetch(`/api/pcm/ordens/${codord}`)
      .then((r) => {
        if (!r.ok) throw new Error("OS não encontrada");
        return r.json();
      })
      .then((j) => setDetail(j.os as OSDetalhe))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [codord]);

  const cfg = detail ? STATUS_CONFIG[detail.statord] : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-end">
      {/* Scrim */}
      <div className="flex-1 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div className="bg-card w-full max-w-md flex flex-col shadow-2xl border-l border-border overflow-hidden animate-in slide-in-from-right duration-200">

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-border">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-muted-foreground font-mono mb-0.5">OS #{codord}</p>
            {loading && (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando...
              </p>
            )}
            {detail && (
              <>
                <h2 className="text-sm font-semibold text-foreground leading-snug">{detail.titulo}</h2>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {cfg && (
                    <span className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border",
                      cfg.bg, cfg.border, cfg.text,
                    )}>
                      <cfg.Icon className="w-3 h-3" />
                      {detail.statusLabel}
                    </span>
                  )}
                  {detail.prioridade && (
                    <span className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium",
                      PRIORIDADE_CONFIG[detail.prioridade.toUpperCase()] ?? "bg-muted text-muted-foreground"
                    )}>
                      {detail.prioridade}
                    </span>
                  )}
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground border border-border">
                    {detail.tipo}
                  </span>
                </div>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-muted-foreground flex-shrink-0 ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-danger/10 text-danger text-xs rounded-lg px-3 py-2 border border-danger/20">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error} — Engeman pode estar offline.
            </div>
          )}

          {detail && (
            <>
              {/* ── Datas ──────────────────────────────────────── */}
              <section>
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">Datas</p>
                <div className="space-y-2">
                  <Row icon={CalendarCheck} label="Abertura" value={detail.datent} />
                  {detail.datafim && (
                    <Row icon={CalendarX} label="Conclusão" value={detail.datafim} />
                  )}
                  {detail.maqpar && (
                    <Row icon={Timer} label="Início parada" value={detail.maqpar} />
                  )}
                  {detail.maqfun && (
                    <Row icon={Timer} label="Retorno máquina" value={detail.maqfun} />
                  )}
                  {detail.horasParada > 0 && (
                    <Row icon={Timer} label="Tempo parada" value={`${detail.horasParada.toFixed(1)}h`} />
                  )}
                </div>
              </section>

              {/* ── Equipamento ────────────────────────────────── */}
              <section>
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">Equipamento</p>
                <div className="space-y-2">
                  <Row icon={Cpu} label="Ativo" value={detail.equipamento} />
                  {detail.tag && (
                    <Row icon={Tag} label="TAG" value={detail.tag} mono />
                  )}
                  <Row icon={MapPin} label="Local" value={detail.local} />
                </div>
              </section>

              {/* ── Responsável ────────────────────────────────── */}
              {detail.responsavel && (
                <section>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">Responsável</p>
                  <Row icon={User} label="Executante" value={detail.responsavel} />
                </section>
              )}

              {/* ── Observações de fechamento ───────────────────── */}
              {detail.observacoes && (
                <section>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">Observações de Fechamento</p>
                  <div className="bg-muted rounded-lg p-3 border border-border">
                    <div className="flex items-start gap-2">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{detail.observacoes}</p>
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Simple detail row
function Row({ icon: Icon, label, value, mono = false }: { icon: React.ElementType; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className={`text-xs font-medium text-foreground ${mono ? "font-mono" : ""}`}>{value}</p>
      </div>
    </div>
  );
}

// ── Drill-down Modal ──────────────────────────────────────────────────────────
function DrillModal({
  statusCode,
  items,
  onClose,
  onSelectOS,
}: {
  statusCode: string;
  items: DetalheOS[];
  onClose: () => void;
  onSelectOS: (codord: number) => void;
}) {
  const cfg = STATUS_CONFIG[statusCode];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-5 h-5 text-muted-foreground" />
            <div>
              <h2 className="text-base font-semibold text-foreground">Ordens de Serviço</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Clique em uma O.S. para ver detalhes
              </p>
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border",
                cfg?.bg,
                cfg?.border,
                cfg?.text,
              )}
            >
              {cfg?.Icon && <cfg.Icon className="w-3.5 h-3.5" />}
              {cfg?.label ?? statusLabel(statusCode)}
            </span>
            <span className="text-xs text-muted-foreground font-medium">
              {items.length} O.S.
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ClipboardList className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">Nenhuma O.S. encontrada neste status.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((os) => {
                const prioStyle = os.prioridade
                  ? (PRIORIDADE_CONFIG[os.prioridade.toUpperCase()] ?? "bg-muted text-muted-foreground")
                  : null;
                const osCfg = STATUS_CONFIG[os.statord];

                return (
                  <button
                    key={`${os.codord}-${os.datent}`}
                    onClick={() => onSelectOS(os.codord)}
                    className="w-full flex items-start gap-3 p-3 rounded-xl border border-border hover:border-info/30 hover:bg-info/10 transition-colors text-left group"
                  >
                    {/* Body */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground truncate group-hover:text-info">{os.titulo}</p>
                        <span className="text-xs text-muted-foreground font-mono flex-shrink-0 pt-0.5">
                          #{os.codord}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{os.local} / {os.equipamento}</span>
                      </div>

                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {/* Status chip */}
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border",
                            osCfg?.bg,
                            osCfg?.border,
                            osCfg?.text,
                          )}
                        >
                          {statusLabel(os.statord)}
                        </span>

                        {/* Tipo chip */}
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground border border-border">
                          {os.tipo}
                        </span>

                        {/* Prioridade chip */}
                        {os.prioridade && prioStyle && (
                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium", prioStyle)}>
                            {os.prioridade}
                          </span>
                        )}

                        {/* Date */}
                        <span className="ml-auto text-[11px] text-muted-foreground flex-shrink-0">
                          {os.datent}
                        </span>

                        {/* Arrow hint */}
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 group-hover:text-blue-400 flex-shrink-0" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function OrdensReportPage() {
  // Resolve initial filters (lazy, runs once on mount)
  const [dias, setDias] = useState<number>(() => {
    if (typeof window === "undefined") return 365;
    try {
      const saved = JSON.parse(localStorage.getItem(LS_FILTER_KEY) ?? "{}");
      return (saved.dias as number) || 365;
    } catch { return 365; }
  });
  const [agrupamento, setAgrupamento] = useState<"semana" | "mes">(() => {
    if (typeof window === "undefined") return "semana";
    try {
      const saved = JSON.parse(localStorage.getItem(LS_FILTER_KEY) ?? "{}");
      return (saved.agrupamento as "semana" | "mes") || "semana";
    } catch { return "semana"; }
  });

  // Lazy-initialize from cache — zero spinner flash on tab switch
  const [data, setData]           = useState<OrdensResponse | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const saved = JSON.parse(localStorage.getItem(LS_FILTER_KEY) ?? "{}");
      const d = (saved.dias as number) || 365;
      const a: "semana" | "mes" = (saved.agrupamento as "semana" | "mes") || "semana";
      return getOrdensCache(d, a);
    } catch { return null; }
  });
  const [loading, setLoading]     = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = JSON.parse(localStorage.getItem(LS_FILTER_KEY) ?? "{}");
      const d = (saved.dias as number) || 365;
      const a: "semana" | "mes" = (saved.agrupamento as "semana" | "mes") || "semana";
      return getOrdensCache(d, a) === null;
    } catch { return true; }
  });
  const [engemanOffline, setEngemanOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [drillStatus, setDrillStatus] = useState<string | null>(null);
  const [drillEquip, setDrillEquip]   = useState<string | null>(null);
  const [selectedCodord, setSelectedCodord] = useState<number | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    try {
      const res  = await fetch(`/api/pcm/ordens?dias=${dias}&agrupamento=${agrupamento}`);
      if (res.status === 503) {
        setEngemanOffline(true);
        if (!background) setData(null);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: OrdensResponse = await res.json();
      setEngemanOffline(false);
      setData(json);
      saveCache(json, dias, agrupamento);
    } catch {
      if (!background) setData(null);
    } finally {
      if (background) setRefreshing(false);
      else setLoading(false);
    }
  }, [dias, agrupamento]);

  // Stale-while-revalidate — lazy init already handles mount; this handles dias/agrupamento changes
  useEffect(() => {
    const cached = getOrdensCache(dias, agrupamento);
    if (cached) {
      setData(cached);
      setLoading(false);
      fetchData(true); // silent background refresh
    } else {
      setData(null);
      setLoading(true);
      fetchData(false);
    }
  }, [fetchData, dias, agrupamento]);

  // Persist filters to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LS_FILTER_KEY, JSON.stringify({ dias, agrupamento }));
    } catch {}
  }, [dias, agrupamento]);

  // ── Derived data ─────────────────────────────────────────────────────────
  const periodos             = data?.periodos             ?? [];
  const statusData           = data?.status;
  const detalhe              = data?.detalhe              ?? {};
  const aplicacoesEmAberto   = data?.aplicacoesEmAberto   ?? [];

  // Pie chart data — only show slices with count > 0
  const pieData = [
    { key: "A", name: "Em Aberto",    value: statusData?.emAberto    ?? 0, color: "#3b82f6" },
    { key: "E", name: "Em Espera",    value: statusData?.emEspera    ?? 0, color: "#f59e0b" },
    { key: "P", name: "Em Progresso", value: statusData?.emProgresso ?? 0, color: "#6366f1" },
    { key: "F", name: "Concluídas",   value: statusData?.concluidas  ?? 0, color: "#22c55e" },
    { key: "C", name: "Canceladas",   value: statusData?.canceladas  ?? 0, color: "#94a3b8" },
  ].filter((s) => s.value > 0);

  const totalStatus = statusData?.total ?? 0;

  // Custom pie label (outside the donut) — uses PieLabelRenderProps which has optional fields
  const renderPieLabel = (props: {
    cx?: number; cy?: number; midAngle?: number;
    outerRadius?: number; name?: string; value?: number;
  }) => {
    const { cx = 0, cy = 0, midAngle = 0, outerRadius = 0, name = "", value = 0 } = props;
    if (value === 0) return null;
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 28;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    const pct = totalStatus > 0 ? Math.round((value / totalStatus) * 100) : 0;
    return (
      <text
        x={x}
        y={y}
        fill="#64748b"
        textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central"
        style={{ fontSize: 11, fontWeight: 500 }}
      >
        {name} ({pct}%)
      </text>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="Relatório de O.S."
        subtitle="Ordens de Serviço — criadas, concluídas e indicadores por período"
        breadcrumbs={[
          { label: "Menu" },
          { label: "PCM" },
          { label: "Relatório OS" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {data?.generatedAt && (
              <span className="text-xs text-muted-foreground hidden sm:block">
                Atualizado às {fmtTime(data.generatedAt)}
              </span>
            )}

            {engemanOffline ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border bg-danger/10 border-danger/30 text-danger">
                <Database className="w-3.5 h-3.5" />
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Engeman inacessível
              </div>
            ) : data && (
              <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border", "bg-success/10 border-success/30 text-success")}>
                <Database className="w-3.5 h-3.5" />
                <span className={cn("w-2 h-2 rounded-full", "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.6)]")} />
                Engeman online
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchData(false)}
              disabled={loading || refreshing}
              className="gap-1.5"
            >
              <RefreshCw
                className={cn("w-4 h-4", (loading || refreshing) && "animate-spin")}
              />
              Atualizar
            </Button>
          </div>
        }
      />

      <div className="px-8 pb-10 space-y-6">

        {/* ── Filter bar ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground font-medium">Período:</span>
            <Select value={String(dias)} onValueChange={(v) => setDias(Number(v))}>
              <SelectTrigger className="w-40 h-8 text-sm">
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

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground font-medium">Agrupamento:</span>
            <Select value={agrupamento} onValueChange={(v) => setAgrupamento(v as "semana" | "mes")}>
              <SelectTrigger className="w-36 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="semana">Por Semana</SelectItem>
                <SelectItem value="mes">Por Mês</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(loading || refreshing) && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {loading ? "Carregando…" : "Atualizando…"}
            </div>
          )}
        </div>

        {/* ── Loading / offline state ──────────────────────────────────────── */}
        {loading && !data && (
          <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Carregando dados do Engeman…</span>
          </div>
        )}
        {!loading && engemanOffline && !data && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-sm">
            <Database className="w-10 h-10 text-red-300" />
            <p className="font-semibold text-danger">Engeman inacessível</p>
            <p className="text-muted-foreground text-center max-w-sm">
              O servidor Engeman não está acessível neste ambiente (rede local apenas).
            </p>
            <Button variant="outline" size="sm" className="gap-1.5 mt-1" onClick={() => fetchData(false)}>
              <RefreshCw className="w-4 h-4" />
              Tentar novamente
            </Button>
          </div>
        )}

        {/* ── Charts row ──────────────────────────────────────────────────── */}
        {data && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Card 1 — Criadas X Concluídas */}
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-foreground">
                    Criadas × Concluídas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* KPI row */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-info/10 rounded-xl px-4 py-3">
                      <p className="text-[11px] text-blue-500 font-medium uppercase tracking-wide">
                        Total Criadas
                      </p>
                      <p className="text-2xl font-bold text-info mt-0.5">
                        {data.totais.criadas}
                      </p>
                    </div>
                    <div className="bg-success/10 rounded-xl px-4 py-3">
                      <p className="text-[11px] text-green-500 font-medium uppercase tracking-wide">
                        Total Concluídas
                      </p>
                      <p className="text-2xl font-bold text-success mt-0.5">
                        {data.totais.concluidas}
                      </p>
                    </div>
                    <div className="bg-muted rounded-xl px-4 py-3">
                      <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                        Índice de Conclusão
                      </p>
                      <p
                        className={cn(
                          "text-2xl font-bold mt-0.5",
                          data.totais.indiceConclusao >= 70
                            ? "text-success"
                            : data.totais.indiceConclusao >= 50
                            ? "text-warning"
                            : "text-danger",
                        )}
                      >
                        {data.totais.indiceConclusao}%
                      </p>
                    </div>
                  </div>

                  {/* Line chart */}
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={periodos} margin={{ top: 5, right: 16, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend
                        wrapperStyle={{ fontSize: 11, color: "#94a3b8", paddingTop: 8 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="criadas"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ r: 3, fill: "#3b82f6" }}
                        name="Criadas"
                        activeDot={{ r: 5 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="concluidas"
                        stroke="#22c55e"
                        strokeWidth={2}
                        dot={{ r: 3, fill: "#22c55e" }}
                        name="Concluídas"
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Card 2 — Preventivas X Corretivas */}
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-foreground">
                    Preventivas × Corretivas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* KPI row */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-info/10 rounded-xl px-4 py-3">
                      <p className="text-[11px] text-blue-500 font-medium uppercase tracking-wide">
                        Preventivas
                      </p>
                      <p className="text-2xl font-bold text-info mt-0.5">
                        {data.tipoTotais.preventivas}
                      </p>
                    </div>
                    <div className="bg-danger/10 rounded-xl px-4 py-3">
                      <p className="text-[11px] text-red-500 font-medium uppercase tracking-wide">
                        Corretivas
                      </p>
                      <p className="text-2xl font-bold text-danger mt-0.5">
                        {data.tipoTotais.corretivas}
                      </p>
                    </div>
                    <div className="bg-muted rounded-xl px-4 py-3">
                      <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                        % Preventivas
                      </p>
                      <p
                        className={cn(
                          "text-2xl font-bold mt-0.5",
                          data.tipoTotais.pctPreventivas >= 60
                            ? "text-info"
                            : data.tipoTotais.pctPreventivas >= 40
                            ? "text-warning"
                            : "text-danger",
                        )}
                      >
                        {data.tipoTotais.pctPreventivas}%
                      </p>
                    </div>
                  </div>

                  {/* Stacked bar chart */}
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={periodos} margin={{ top: 5, right: 16, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend
                        wrapperStyle={{ fontSize: 11, color: "#94a3b8", paddingTop: 8 }}
                      />
                      <Bar
                        dataKey="preventivas"
                        stackId="a"
                        fill="#3b82f6"
                        name="Preventivas"
                        radius={[0, 0, 2, 2]}
                      />
                      <Bar
                        dataKey="corretivas"
                        stackId="a"
                        fill="#ef4444"
                        name="Corretivas"
                        radius={[2, 2, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* ── Status section ─────────────────────────────────────────── */}
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-foreground">
                  Status das O.S.
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    — clique num status para ver as ordens
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col lg:flex-row gap-6 items-center lg:items-start">

                  {/* Counters */}
                  <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 w-full">
                    {(["A","E","P","F","C"] as const).map((code) => {
                      const cfg = STATUS_CONFIG[code];
                      const count =
                        code === "A" ? (statusData?.emAberto    ?? 0)
                        : code === "E" ? (statusData?.emEspera    ?? 0)
                        : code === "P" ? (statusData?.emProgresso ?? 0)
                        : code === "F" ? (statusData?.concluidas  ?? 0)
                        :                (statusData?.canceladas  ?? 0);

                      return (
                        <button
                          key={code}
                          onClick={() => setDrillStatus(code)}
                          className={cn(
                            "flex flex-col items-center justify-center gap-1 rounded-2xl border-2 px-4 py-4 transition-all hover:shadow-md hover:scale-[1.02] cursor-pointer",
                            cfg.bg,
                            cfg.border,
                            drillStatus === code && "ring-2 ring-offset-1 ring-current shadow-md",
                          )}
                        >
                          <cfg.Icon className={cn("w-6 h-6", cfg.text)} />
                          <span className={cn("text-3xl font-bold leading-none", cfg.text)}>
                            {count}
                          </span>
                          <span className={cn("text-xs font-medium text-center", cfg.text)}>
                            {cfg.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Donut chart */}
                  <div className="flex-shrink-0 w-full lg:w-80">
                    {pieData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={110}
                            paddingAngle={3}
                            dataKey="value"
                            label={renderPieLabel}
                            labelLine={false}
                            onClick={(entry) => {
                              const code = (entry as { key?: string }).key;
                              if (code) setDrillStatus(code);
                            }}
                            style={{ cursor: "pointer" }}
                          >
                            {pieData.map((entry) => (
                              <Cell
                                key={entry.key}
                                fill={entry.color}
                                opacity={drillStatus === null || drillStatus === entry.key ? 1 : 0.45}
                                stroke="white"
                                strokeWidth={2}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value) => {
                              const n = typeof value === "number" ? value : 0;
                              return `${n} (${totalStatus > 0 ? Math.round((n / totalStatus) * 100) : 0}%)`;
                            }}
                            contentStyle={{
                              border: "1px solid #e2e8f0",
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-[260px] text-muted-foreground/60">
                        <p className="text-sm">Sem dados</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Donut center label (total) */}
                <p className="text-center text-xs text-muted-foreground mt-1">
                  Total: <span className="font-semibold text-muted-foreground">{totalStatus}</span> ordens de serviço no período
                </p>
              </CardContent>
            </Card>

            {/* ── Aplicações com OS em Aberto ───────────────────────────── */}
            {aplicacoesEmAberto.length > 0 && (
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                    Aplicações com O.S. em Aberto
                    <span className="text-xs font-normal text-muted-foreground">
                      — backlog atual ({aplicacoesEmAberto.length} equipamento{aplicacoesEmAberto.length !== 1 ? "s" : ""})
                    </span>
                    <span className="ml-auto text-xs font-normal text-muted-foreground">
                      clique para ver as ordens
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted border-b border-border">
                        <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                          <th className="text-left px-4 py-2.5 font-medium">#</th>
                          <th className="text-left px-4 py-2.5 font-medium">Equipamento</th>
                          <th className="text-left px-4 py-2.5 font-medium">Local</th>
                          <th className="text-center px-3 py-2.5 font-medium">Em Aberto</th>
                          <th className="text-center px-3 py-2.5 font-medium">Em Espera</th>
                          <th className="text-center px-3 py-2.5 font-medium">Em Progresso</th>
                          <th className="text-center px-3 py-2.5 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {aplicacoesEmAberto.map((apl: AplicacaoEmAberto, idx: number) => (
                          <tr
                            key={apl.codApl ?? idx}
                            className="hover:bg-info/10 transition-colors group"
                          >
                            <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">{idx + 1}</td>
                            <td className="px-4 py-2.5">
                              <p className="text-sm font-medium text-foreground group-hover:text-info">{apl.equipamento}</p>
                              {apl.codApl && <p className="text-[11px] text-muted-foreground font-mono">TAG {apl.codApl}</p>}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <MapPin className="w-3 h-3 shrink-0 text-muted-foreground/60" />
                                {apl.local}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {apl.emAberto > 0 ? (
                                <button
                                  onClick={() => { setDrillStatus("A"); setDrillEquip(apl.equipamento); }}
                                  className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold bg-info/15 text-info hover:bg-blue-200 transition-colors"
                                >
                                  {apl.emAberto}
                                </button>
                              ) : <span className="text-gray-200">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {apl.emEspera > 0 ? (
                                <button
                                  onClick={() => { setDrillStatus("E"); setDrillEquip(apl.equipamento); }}
                                  className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold bg-warning/15 text-warning hover:bg-amber-200 transition-colors"
                                >
                                  {apl.emEspera}
                                </button>
                              ) : <span className="text-gray-200">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {apl.emProgresso > 0 ? (
                                <button
                                  onClick={() => { setDrillStatus("P"); setDrillEquip(apl.equipamento); }}
                                  className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 dark:bg-indigo-500/25 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 transition-colors"
                                >
                                  {apl.emProgresso}
                                </button>
                              ) : <span className="text-gray-200">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <button
                                onClick={() => { setDrillStatus("A"); setDrillEquip(apl.equipamento); }}
                                className="inline-flex items-center justify-center min-w-[32px] px-2.5 py-1 rounded-full text-xs font-bold bg-muted text-foreground hover:bg-muted transition-colors"
                              >
                                {apl.total}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Footer */}
            <p className="text-xs text-muted-foreground text-right">
              Atualizado em{" "}
              {new Date(data.generatedAt).toLocaleString("pt-BR")} ·{" "}
              Fonte: Engeman CMMS
            </p>
          </>
        )}
      </div>

      {/* ── Drill-down modal ──────────────────────────────────────────────── */}
      {drillStatus !== null && data && (
        <DrillModal
          statusCode={drillStatus}
          items={(detalhe[drillStatus] ?? []).filter((os) =>
            drillEquip ? os.equipamento === drillEquip : true
          )}
          onClose={() => { setDrillStatus(null); setDrillEquip(null); setSelectedCodord(null); }}
          onSelectOS={(codord) => setSelectedCodord(codord)}
        />
      )}

      {/* ── OS Detail side panel ──────────────────────────────────────────── */}
      {selectedCodord !== null && (
        <OSDetailPanel
          codord={selectedCodord}
          onClose={() => setSelectedCodord(null)}
        />
      )}
    </div>
  );
}
