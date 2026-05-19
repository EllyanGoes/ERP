"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ChevronUp,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Settings2,
  RefreshCw,
  Search,
  TrendingUp,
  TrendingDown,
  Database,
  ShieldCheck,
  GitBranch,
  MapPin,
  Cpu,
  CheckSquare,
  Square,
  MinusSquare,
  X as XIcon,
  TableProperties,
  HelpCircle,
  Info,
} from "lucide-react";
import Link from "next/link";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";
import type { IndicadorEquipamento, TendenciaMensal, IndicadoresResponse } from "@/app/api/pcm/indicadores/route";
import type { LocalNode, AplicacoesResponse } from "@/app/api/pcm/aplicacoes/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmt1(n: number) {
  return n.toFixed(1);
}

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`;
}

type SortField = keyof Pick<
  IndicadorEquipamento,
  "descricao" | "totalFalhas" | "mtbf" | "mttr" | "disponibilidade" | "confiabilidade"
>;

const LS_TARGETS_KEY    = "pcm_targets_v1";
const LS_CACHE_KEY      = "pcm_indicadores_cache_v2";
const CACHE_MAX_AGE_MS  = 30 * 60 * 1000; // 30 min — dados ficam válidos

// ── Targets ──────────────────────────────────────────────────────────────────
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

// ── Data cache ────────────────────────────────────────────────────────────────
type CacheEntry = { data: IndicadoresResponse; dias: number; savedAt: string };

function saveDataCache(data: IndicadoresResponse, dias: number) {
  if (typeof window === "undefined") return;
  try {
    const entry: CacheEntry = { data, dias, savedAt: new Date().toISOString() };
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify(entry));
  } catch {}
}

function loadDataCache(dias: number): { data: IndicadoresResponse; stale: boolean } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (entry.dias !== dias) return null; // período diferente, ignorar
    const age = Date.now() - new Date(entry.savedAt).getTime();
    return { data: entry.data, stale: age > CACHE_MAX_AGE_MS };
  } catch { return null; }
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

/** Format hours as "Xd Yh" if ≥ 24h, else "X,Xh" */
function fmtHoras(h: number): string {
  if (h <= 0) return "0h";
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const r = Math.round(h % 24);
    return r > 0 ? `${d}d ${r}h` : `${d}d`;
  }
  return `${h.toFixed(1)}h`;
}

// ── Metric line chart ─────────────────────────────────────────────────────────
type MetricKey = "mtbfMedio" | "mttrMedio" | "disponibilidade" | "confiabilidade";

interface MetricConfig {
  key: MetricKey;
  label: string;
  color: string;
  fmtY: (v: number) => string;
  fmtDot: (v: number) => string;
  domain?: [number | "auto" | "dataMin", number | "auto" | "dataMax"];
  target?: number;
  targetLabel?: string;
}

const METRIC_CONFIGS: MetricConfig[] = [
  {
    key:         "disponibilidade",
    label:       "Disponibilidade",
    color:       "#22c55e",
    fmtY:        (v) => `${v.toFixed(1)}%`,
    fmtDot:      (v) => `${v.toFixed(2)}%`,
    domain:      ["auto", "dataMax"],
  },
  {
    key:         "confiabilidade",
    label:       "Confiabilidade",
    color:       "#3b82f6",
    fmtY:        (v) => `${v.toFixed(1)}%`,
    fmtDot:      (v) => `${v.toFixed(2)}%`,
    domain:      ["auto", "dataMax"],
  },
  {
    key:         "mtbfMedio",
    label:       "MTBF",
    color:       "#14b8a6",
    fmtY:        fmtHoras,
    fmtDot:      fmtHoras,
    domain:      ["auto", "dataMax"],
  },
  {
    key:         "mttrMedio",
    label:       "MTTR",
    color:       "#f59e0b",
    fmtY:        fmtHoras,
    fmtDot:      fmtHoras,
    domain:      ["auto", "dataMax"],
  },
];

// Custom dot with value label above
function LabeledDot(props: {
  cx?: number; cy?: number; value?: number; fmtDot: (v: number) => string; color: string;
}) {
  const { cx = 0, cy = 0, value = 0, fmtDot, color } = props;
  return (
    <g>
      <circle cx={cx} cy={cy} r={5} fill={color} stroke="white" strokeWidth={2} />
      <text
        x={cx} y={cy - 10}
        textAnchor="middle"
        fontSize={10}
        fontWeight={600}
        fill="#374151"
      >
        {fmtDot(value)}
      </text>
    </g>
  );
}

// ── Drill-down modal ──────────────────────────────────────────────────────────
function DrillModal({
  metric,
  equipamentos,
  targets,
  onClose,
}: {
  metric: MetricConfig;
  equipamentos: IndicadorEquipamento[];
  targets: { mtbf: number; mttr: number };
  onClose: () => void;
}) {
  function eqVal(eq: IndicadorEquipamento): number {
    if (metric.key === "mtbfMedio")       return eq.mtbf;
    if (metric.key === "mttrMedio")       return eq.mttr;
    if (metric.key === "disponibilidade") return eq.disponibilidade;
    return eq.confiabilidade;
  }

  const sorted = [...equipamentos].sort((a, b) => {
    const va = eqVal(a);
    const vb = eqVal(b);
    // For MTTR lower is better → asc; for others → desc
    return metric.key === "mttrMedio" ? va - vb : vb - va;
  });

  const isGood = (eq: IndicadorEquipamento) => {
    if (metric.key === "mtbfMedio")     return eq.mtbf  >= targets.mtbf;
    if (metric.key === "mttrMedio")     return eq.mttr  <= targets.mttr;
    if (metric.key === "disponibilidade") return eq.disponibilidade >= 95;
    if (metric.key === "confiabilidade")  return eq.confiabilidade  >= 60;
    return true;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <TableProperties className="w-4 h-4 text-gray-400" />
              Visão Detalhada — {metric.label}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">{sorted.length} equipamentos · ordenados do melhor para o pior</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Table */}
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Equipamento</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Local</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Falhas</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">{metric.label}</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((eq, i) => {
                const raw = eqVal(eq);
                const good = isGood(eq);
                return (
                  <tr key={eq.codApl} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-300 w-5 text-right font-mono">{i + 1}</span>
                        <div>
                          <p className="font-medium text-gray-800 truncate max-w-[180px]">{eq.descricao}</p>
                          <p className="text-xs text-gray-400 font-mono">{eq.tag}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell">
                      <span className="truncate block max-w-[160px]">{eq.localInstalacao}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Link href={`/pcm/fmea/${eq.codApl}`} title="Ver FMEA">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold cursor-pointer hover:ring-2 hover:ring-offset-1 transition-all ${
                          eq.totalFalhas >= 5 ? "bg-red-100 text-red-700 hover:ring-red-300" : eq.totalFalhas >= 3 ? "bg-amber-100 text-amber-700 hover:ring-amber-300" : "bg-gray-100 text-gray-600 hover:ring-gray-300"
                        }`}>{eq.totalFalhas}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold text-base ${good ? "text-green-600" : "text-red-600"}`} style={{ color: good ? metric.color : "#ef4444" }}>
                        {metric.fmtDot(raw)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        good ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}>
                        {good ? "✓ OK" : "✗ Abaixo"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Info Panel
// ---------------------------------------------------------------------------
const INFO_ITEMS = [
  {
    icon: HelpCircle,
    color: "text-blue-500",
    bg: "bg-blue-50",
    title: "Por que nem todos os ativos aparecem?",
    body: "O relatório exibe apenas equipamentos que tiveram ao menos 1 OS corretiva fechada (STATORD = 'F') no período. Para aparecer, o ativo precisa: (1) estar cadastrado em APLIC com CODAPL válido; (2) ter ao menos uma Ordem de Serviço corretiva (CODTIPMAN 1, 2 ou 3) vinculada; (3) a OS deve estar Fechada. O filtro de Ativo/Local mostra todos os ativos ativos no cadastro, mas a tabela de indicadores só exibe os que têm histórico de falhas.",
  },
  {
    icon: Info,
    color: "text-indigo-500",
    bg: "bg-indigo-50",
    title: "O filtro de ativos agrupa por local?",
    body: "Sim. O popover 'Ativo / Local' agrupa os equipamentos pelo campo LOCAPLIC.DESCRICAO (local de instalação). Expanda o local para ver seus equipamentos e selecione ou desmarque individualmente ou por grupo completo. A seleção atualiza automaticamente todos os gráficos e a tabela de indicadores.",
  },
  {
    icon: Info,
    color: "text-teal-500",
    bg: "bg-teal-50",
    title: "É necessário ter escala de trabalho pré-definida?",
    body: "Não. O cálculo usa o período selecionado (ex.: 365 dias × 24 h = 8.760 h) como base para MTBF e Disponibilidade, sem depender de calendário de turnos. Se quiser calcular pela disponibilidade real do equipamento — descontando finais de semana, turnos e feriados —, seria necessário cadastrar a escala de trabalho no Engeman e incluir esse campo na consulta. Por enquanto o relatório funciona corretamente sem escala definida.",
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
          <span className="text-sm font-medium text-gray-600">
            Entendendo este relatório
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
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
// Sub-components
// ---------------------------------------------------------------------------
function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  bg,
  trend,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  trend?: "up" | "down" | null;
}) {
  return (
    <Card className="border-gray-100">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {title}
            </p>
            <div className="flex items-baseline gap-1.5 mt-1">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              {trend === "up" && <TrendingUp className="w-4 h-4 text-green-500" />}
              {trend === "down" && <TrendingDown className="w-4 h-4 text-red-500" />}
            </div>
            <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
          </div>
          <div className={`p-2 rounded-lg ${bg}`}>
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ value, target, higherIsBetter = true }: { value: number; target: number; higherIsBetter?: boolean }) {
  const isGood = higherIsBetter ? value >= target : value <= target;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
        isGood
          ? "bg-green-100 text-green-700"
          : "bg-red-100 text-red-700"
      }`}
    >
      {isGood ? (
        <ChevronUp className="w-3 h-3" />
      ) : (
        <AlertTriangle className="w-3 h-3" />
      )}
      {isGood ? "OK" : "Abaixo"}
    </span>
  );
}

function SortIcon({ field, sortField, sortDir }: { field: string; sortField: string; sortDir: "asc" | "desc" }) {
  if (sortField !== field) return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
  return sortDir === "asc" ? (
    <ChevronUp className="w-3 h-3" />
  ) : (
    <ChevronDown className="w-3 h-3" />
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function PCMDashboardPage() {
  const [dias, setDias] = useState(365);
  const [data, setData] = useState<IndicadoresResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false); // background refresh
  const [sortField, setSortField] = useState<SortField>("mtbf");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showTargets, setShowTargets] = useState(false);
  const [targets, setTargets] = useState<{ mtbf: number; mttr: number }>({ mtbf: 120, mttr: 4 });
  const [targetInput, setTargetInput] = useState({ mtbf: "120", mttr: "4" });

  // ── Drill-down ────────────────────────────────────────────────────────────────
  const [drillMetric, setDrillMetric] = useState<MetricConfig | null>(null);

  // ── Tree popover filter ──────────────────────────────────────────────────────
  const [showTreePopover, setShowTreePopover]   = useState(false);
  const [treeSelected, setTreeSelected]         = useState<Set<number> | null>(null); // null = all
  const [treeExpanded, setTreeExpanded]         = useState<Set<string>>(new Set());
  const [treeSearch, setTreeSearch]             = useState("");
  const [allLocais, setAllLocais]               = useState<LocalNode[]>([]);
  const [loadingLocais, setLoadingLocais]       = useState(false);
  const treePopoverRef                          = useRef<HTMLDivElement>(null);

  // Load targets from localStorage on mount
  useEffect(() => {
    const t = loadTargets();
    setTargets(t);
    setTargetInput({ mtbf: String(t.mtbf), mttr: String(t.mttr) });
  }, []);

  // background=true → não mostra spinner, só atualiza dados silenciosamente
  const fetchData = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/pcm/indicadores?dias=${dias}`);
      const json: IndicadoresResponse = await res.json();
      setData(json);
      saveDataCache(json, dias);
    } catch {
      if (!background) setData(null);
    } finally {
      if (background) setRefreshing(false);
      else setLoading(false);
    }
  }, [dias]);

  // Stale-while-revalidate: mostra cache imediatamente, atualiza em background
  useEffect(() => {
    const cached = loadDataCache(dias);
    if (cached) {
      setData(cached.data);
      setLoading(false);
      fetchData(true); // refresca silenciosamente
    } else {
      fetchData(false);
    }
  }, [fetchData, dias]);

  // Load full application tree (all active APLIC, not just those with OS)
  useEffect(() => {
    setLoadingLocais(true);
    fetch("/api/pcm/aplicacoes")
      .then((r) => r.json())
      .then((json: AplicacoesResponse) => setAllLocais(json.locais))
      .catch(() => {})
      .finally(() => setLoadingLocais(false));
  }, []);

  // Close tree popover on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (treePopoverRef.current && !treePopoverRef.current.contains(e.target as Node)) {
        setShowTreePopover(false);
      }
    }
    if (showTreePopover) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showTreePopover]);

  // Filtered tree nodes for the popover (search-filtered)
  const treeNodes = useMemo(() => {
    if (!treeSearch.trim()) return allLocais;
    const q = treeSearch.toLowerCase();
    return allLocais
      .map((loc) => ({
        ...loc,
        equips: loc.equips.filter(
          (e) => e.descricao.toLowerCase().includes(q) || e.tag.toLowerCase().includes(q)
        ),
      }))
      .filter((loc) => loc.descricao.toLowerCase().includes(q) || loc.equips.length > 0);
  }, [allLocais, treeSearch]);

  // Expand matched nodes when searching
  useEffect(() => {
    if (treeSearch.trim()) {
      setTreeExpanded(new Set(treeNodes.map((n) => n.descricao)));
    }
  }, [treeSearch, treeNodes]);

  // Expand all on first load
  useEffect(() => {
    if (allLocais.length > 0 && treeExpanded.size === 0) {
      setTreeExpanded(new Set(allLocais.map((n) => n.descricao)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLocais]);

  // All codApls from the full tree (not just those with OS)
  const allCodApls = useMemo(
    () => new Set(allLocais.flatMap((l) => l.equips.map((e) => e.codApl))),
    [allLocais]
  );

  // ── Tree helpers ────────────────────────────────────────────────────────────
  function toggleTreeLocation(local: string, equips: { codApl: number }[]) {
    const ids = equips.map((e) => e.codApl);
    setTreeSelected((prev) => {
      const base = prev ?? allCodApls;
      const allSelected = ids.every((id) => base.has(id));
      const next = new Set(base);
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      // If everything is selected, go back to null (= all)
      return next.size === allCodApls.size ? null : next;
    });
  }

  function toggleTreeEquip(codApl: number) {
    setTreeSelected((prev) => {
      const base = prev ?? new Set(allCodApls);
      const next = new Set(base);
      if (next.has(codApl)) {
        next.delete(codApl);
      } else {
        next.add(codApl);
      }
      return next.size === allCodApls.size ? null : next;
    });
  }

  function locationCheckState(equips: { codApl: number }[]): "all" | "none" | "partial" {
    if (!treeSelected) return "all";
    const total = equips.length;
    const sel = equips.filter((e) => treeSelected.has(e.codApl)).length;
    if (sel === 0) return "none";
    if (sel === total) return "all";
    return "partial";
  }

  // Filtered + sorted equipamentos
  const equipamentosFiltrados = useMemo(() => {
    if (!data) return [];
    let list = data.equipamentos;

    if (treeSelected !== null) {
      list = list.filter((e) => treeSelected.has(e.codApl));
    }

    list = [...list].sort((a, b) => {
      const aVal = a[sortField] as number | string;
      const bVal = b[sortField] as number | string;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      const diff = (aVal as number) - (bVal as number);
      return sortDir === "asc" ? diff : -diff;
    });

    return list;
  }, [data, sortField, sortDir, treeSelected]);

  // KPI averages — reflect current tree selection
  const kpis = useMemo(() => {
    const list = equipamentosFiltrados;
    if (list.length === 0) {
      return { mtbf: 0, mttr: 0, disp: 0, conf: 0 };
    }
    return {
      mtbf: list.reduce((s, e) => s + e.mtbf, 0) / list.length,
      mttr: list.reduce((s, e) => s + e.mttr, 0) / list.length,
      disp: list.reduce((s, e) => s + e.disponibilidade, 0) / list.length,
      conf: list.reduce((s, e) => s + e.confiabilidade, 0) / list.length,
    };
  }, [equipamentosFiltrados]);


  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function applyTargets() {
    const t = {
      mtbf: Math.max(1, Number(targetInput.mtbf) || 120),
      mttr: Math.max(0.5, Number(targetInput.mttr) || 4),
    };
    setTargets(t);
    saveTargets(t);
    setShowTargets(false);
  }

  // Generic tooltip for metric line charts
  function MetricTooltip({ active, payload, label, fmtDot }: { active?: boolean; payload?: any[]; label?: string; fmtDot: (v: number) => string }) {
    if (active && payload?.length) {
      return (
        <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow text-xs">
          <p className="font-semibold text-gray-600 mb-1">{label}</p>
          {payload.map((p: any) => (
            <p key={p.dataKey} style={{ color: p.color }} className="font-bold text-sm">
              {fmtDot(p.value)}
            </p>
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
        breadcrumbs={[
          { label: "Menu" },
          { label: "PCM" },
          { label: "Dashboard" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {/* Last update time */}
            {data?.generatedAt && (
              <span className="text-xs text-gray-400 hidden sm:block">
                Atualizado às {fmtTime(data.generatedAt)}
              </span>
            )}

            {/* Connection status indicator — always visible when data is present */}
            {data && (
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
                  data.source === "db"
                    ? "bg-green-50 border-green-200 text-green-700"
                    : "bg-amber-50 border-amber-200 text-amber-700"
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span
                  className={`w-2 h-2 rounded-full ${
                    data.source === "db"
                      ? "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.6)]"
                      : "bg-amber-400"
                  }`}
                />
                {data.source === "db" ? "Engeman online" : "Engeman offline"}
              </div>
            )}

            {/* Data quality button */}
            <Link href="/pcm/qualidade">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                Qualidade dos dados
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTargets((v) => !v)}
              className="gap-1"
            >
              <Settings2 className="w-4 h-4" />
              Metas
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchData(false)}
              disabled={loading || refreshing}
              className="gap-1"
            >
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
                  <p className="text-sm font-semibold text-gray-700 mb-3">
                    Configuração de Metas
                  </p>
                  <div className="flex items-end gap-4">
                    <div>
                      <Label className="text-xs text-gray-500 mb-1 block">
                        Meta MTBF (horas)
                      </Label>
                      <Input
                        type="number"
                        value={targetInput.mtbf}
                        onChange={(e) =>
                          setTargetInput((t) => ({ ...t, mtbf: e.target.value }))
                        }
                        className="w-28 h-8 text-sm"
                        min={1}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500 mb-1 block">
                        Meta MTTR (horas)
                      </Label>
                      <Input
                        type="number"
                        value={targetInput.mttr}
                        onChange={(e) =>
                          setTargetInput((t) => ({ ...t, mttr: e.target.value }))
                        }
                        className="w-28 h-8 text-sm"
                        min={0.5}
                        step={0.5}
                      />
                    </div>
                    <Button size="sm" onClick={applyTargets}>
                      Aplicar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowTargets(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
                <div className="text-xs text-gray-400 ml-auto">
                  Valores salvos no navegador (localStorage)
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          <KpiCard
            title="Média MTBF"
            value={`${fmt1(kpis.mtbf)}h`}
            subtitle={`Meta: ${targets.mtbf}h entre falhas`}
            icon={Activity}
            color={kpis.mtbf >= targets.mtbf ? "text-blue-600" : "text-red-600"}
            bg={kpis.mtbf >= targets.mtbf ? "bg-blue-50" : "bg-red-50"}
            trend={kpis.mtbf >= targets.mtbf ? "up" : "down"}
          />
          <KpiCard
            title="Média MTTR"
            value={`${fmt1(kpis.mttr)}h`}
            subtitle={`Meta: ≤ ${targets.mttr}h para reparar`}
            icon={AlertTriangle}
            color={kpis.mttr <= targets.mttr ? "text-green-600" : "text-red-600"}
            bg={kpis.mttr <= targets.mttr ? "bg-green-50" : "bg-red-50"}
            trend={kpis.mttr <= targets.mttr ? "up" : "down"}
          />
          <KpiCard
            title="Disponibilidade Média"
            value={fmtPct(kpis.disp)}
            subtitle="Tempo operacional / período"
            icon={TrendingUp}
            color={kpis.disp >= 95 ? "text-green-600" : kpis.disp >= 85 ? "text-amber-600" : "text-red-600"}
            bg={kpis.disp >= 95 ? "bg-green-50" : kpis.disp >= 85 ? "bg-amber-50" : "bg-red-50"}
            trend={kpis.disp >= 90 ? "up" : "down"}
          />
          <KpiCard
            title="Confiabilidade Média"
            value={fmtPct(kpis.conf)}
            subtitle="R(t) = e^(-720/MTBF) em 720h"
            icon={Activity}
            color={kpis.conf >= 60 ? "text-blue-600" : "text-amber-600"}
            bg={kpis.conf >= 60 ? "bg-blue-50" : "bg-amber-50"}
            trend={kpis.conf >= 60 ? "up" : "down"}
          />
        </div>

        {/* Filters */}
        <div className="flex items-end gap-3 flex-wrap">

          {/* Tree popover filter */}
          <div className="relative" ref={treePopoverRef}>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Ativo / Local</Label>
              <Button
                variant={treeSelected !== null ? "default" : "outline"}
                size="sm"
                onClick={() => setShowTreePopover((v) => !v)}
                className={`gap-1.5 h-8 ${treeSelected !== null ? "bg-blue-600 hover:bg-blue-700" : ""}`}
              >
                <GitBranch className="w-3.5 h-3.5" />
                Ativo / Local
                {treeSelected !== null && treeSelected.size > 0 && (
                  <span className="ml-0.5 bg-white text-blue-600 text-[10px] font-bold rounded-full px-1.5 leading-4">
                    {treeSelected.size}
                  </span>
                )}
              </Button>
            </div>

            {/* Popover panel */}
            {showTreePopover && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-white rounded-xl border border-gray-200 shadow-xl w-72 flex flex-col max-h-[420px]">
                {/* Search */}
                <div className="p-2 border-b border-gray-100">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      autoFocus
                      className="w-full pl-8 pr-3 h-8 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Buscar ativo ou local..."
                      value={treeSearch}
                      onChange={(e) => setTreeSearch(e.target.value)}
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-50 bg-gray-50/50">
                  <button onClick={() => setTreeSelected(null)} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                    Todos
                  </button>
                  <span className="text-gray-300">·</span>
                  <button onClick={() => setTreeSelected(new Set())} className="text-xs text-gray-500 hover:text-gray-700">
                    Nenhum
                  </button>
                  <span className="ml-auto text-xs text-gray-400">
                    {treeSelected === null ? allCodApls.size : treeSelected.size}/{allCodApls.size}
                  </span>
                </div>

                {/* Tree */}
                <div className="overflow-y-auto flex-1 py-1">
                  {loadingLocais ? (
                    <div className="flex items-center justify-center py-6 text-gray-400 text-xs gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Carregando...
                    </div>
                  ) : treeNodes.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">Nenhum resultado</p>
                  ) : treeNodes.map((node) => {
                    const expanded = treeExpanded.has(node.descricao);
                    const checkState = locationCheckState(node.equips);
                    return (
                      <div key={node.descricao}>
                        <div className="flex items-center gap-1 px-2 py-1 hover:bg-gray-50 group">
                          <button
                            onClick={() => setTreeExpanded((prev) => {
                              const next = new Set(prev);
                              if (next.has(node.descricao)) next.delete(node.descricao);
                              else next.add(node.descricao);
                              return next;
                            })}
                            className="p-0.5 text-gray-400 hover:text-gray-600 flex-shrink-0"
                          >
                            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => toggleTreeLocation(node.descricao, node.equips)} className="flex-shrink-0 text-blue-600">
                            {checkState === "all" ? <CheckSquare className="w-4 h-4" /> : checkState === "partial" ? <MinusSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4 text-gray-300" />}
                          </button>
                          <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="text-xs font-medium text-gray-700 truncate flex-1 cursor-pointer" onClick={() => toggleTreeLocation(node.descricao, node.equips)} title={node.descricao}>
                            {node.descricao}
                          </span>
                          <span className="text-xs text-gray-300 flex-shrink-0">{node.equips.length}</span>
                        </div>
                        {expanded && node.equips.map((eq) => {
                          const sel = !treeSelected || treeSelected.has(eq.codApl);
                          return (
                            <div key={eq.codApl} className="flex items-center gap-1 pl-7 pr-2 py-0.5 hover:bg-gray-50 cursor-pointer" onClick={() => toggleTreeEquip(eq.codApl)}>
                              <button className="flex-shrink-0 text-blue-600">
                                {sel ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5 text-gray-300" />}
                              </button>
                              <Cpu className="w-3 h-3 text-blue-400 flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className={`text-xs truncate ${sel ? "text-gray-700" : "text-gray-400"}`} title={eq.descricao}>{eq.descricao}</p>
                                <p className="text-[10px] text-gray-400 font-mono">{eq.tag}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Período</Label>
            <Select
              value={String(dias)}
              onValueChange={(v) => setDias(Number(v))}
            >
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

        </div>

        {/* Main table */}
        <Card className="border-gray-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center justify-between">
              <span>
                Indicadores por Equipamento
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {equipamentosFiltrados.length} equipamentos
                </span>
              </span>
              <span className="text-xs font-normal text-gray-400">
                Meta MTBF: {targets.mtbf}h · Meta MTTR: {targets.mttr}h
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Carregando dados do Engeman…
              </div>
            ) : equipamentosFiltrados.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
                Nenhum equipamento encontrado para o período.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-gray-400 uppercase bg-gray-50">
                      <th className="text-left px-4 py-2.5">
                        <button
                          className="flex items-center gap-1 hover:text-gray-600"
                          onClick={() => handleSort("descricao")}
                        >
                          Equipamento
                          <SortIcon field="descricao" sortField={sortField} sortDir={sortDir} />
                        </button>
                      </th>
                      <th className="text-left px-4 py-2.5 hidden lg:table-cell">Local</th>
                      <th className="text-center px-3 py-2.5">
                        <button
                          className="flex items-center gap-1 hover:text-gray-600 mx-auto"
                          onClick={() => handleSort("totalFalhas")}
                        >
                          Falhas
                          <SortIcon field="totalFalhas" sortField={sortField} sortDir={sortDir} />
                        </button>
                      </th>
                      <th className="text-center px-3 py-2.5">
                        <button
                          className="flex items-center gap-1 hover:text-gray-600 mx-auto"
                          onClick={() => handleSort("mtbf")}
                        >
                          MTBF (h)
                          <SortIcon field="mtbf" sortField={sortField} sortDir={sortDir} />
                        </button>
                      </th>
                      <th className="text-center px-3 py-2.5">
                        <button
                          className="flex items-center gap-1 hover:text-gray-600 mx-auto"
                          onClick={() => handleSort("mttr")}
                        >
                          MTTR (h)
                          <SortIcon field="mttr" sortField={sortField} sortDir={sortDir} />
                        </button>
                      </th>
                      <th className="text-center px-3 py-2.5">
                        <button
                          className="flex items-center gap-1 hover:text-gray-600 mx-auto"
                          onClick={() => handleSort("disponibilidade")}
                        >
                          Disponib.
                          <SortIcon field="disponibilidade" sortField={sortField} sortDir={sortDir} />
                        </button>
                      </th>
                      <th className="text-center px-3 py-2.5">
                        <button
                          className="flex items-center gap-1 hover:text-gray-600 mx-auto"
                          onClick={() => handleSort("confiabilidade")}
                        >
                          Confiab.
                          <SortIcon field="confiabilidade" sortField={sortField} sortDir={sortDir} />
                        </button>
                      </th>
                      <th className="text-center px-3 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipamentosFiltrados.map((eq) => {
                      const abaixoMtbf = eq.mtbf < targets.mtbf;
                      const abaixoMttr = eq.mttr > targets.mttr;
                      const rowBg =
                        abaixoMtbf && abaixoMttr
                          ? "bg-red-50/60"
                          : abaixoMtbf
                          ? "bg-amber-50/60"
                          : "";

                      return (
                        <tr
                          key={eq.codApl}
                          className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${rowBg}`}
                        >
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-800 truncate max-w-[200px]">
                              {eq.descricao}
                            </p>
                            <p className="text-xs text-gray-400 font-mono">{eq.tag}</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 hidden lg:table-cell max-w-[180px]">
                            <span className="truncate block">{eq.localInstalacao || "—"}</span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <Link href={`/pcm/fmea/${eq.codApl}`} title="Ver FMEA">
                              <span
                                className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold cursor-pointer hover:ring-2 hover:ring-offset-1 transition-all ${
                                  eq.totalFalhas >= 5
                                    ? "bg-red-100 text-red-700 hover:ring-red-300"
                                    : eq.totalFalhas >= 3
                                    ? "bg-amber-100 text-amber-700 hover:ring-amber-300"
                                    : "bg-gray-100 text-gray-600 hover:ring-gray-300"
                                }`}
                              >
                                {eq.totalFalhas}
                              </span>
                            </Link>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span
                              className={`font-semibold ${
                                abaixoMtbf ? "text-red-600" : "text-gray-800"
                              }`}
                            >
                              {fmt1(eq.mtbf)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span
                              className={`font-semibold ${
                                abaixoMttr ? "text-amber-600" : "text-gray-800"
                              }`}
                            >
                              {fmt1(eq.mttr)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              <span
                                className={`text-sm font-semibold ${
                                  eq.disponibilidade >= 95
                                    ? "text-green-600"
                                    : eq.disponibilidade >= 85
                                    ? "text-amber-600"
                                    : "text-red-600"
                                }`}
                              >
                                {fmtPct(eq.disponibilidade)}
                              </span>
                              <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    eq.disponibilidade >= 95
                                      ? "bg-green-500"
                                      : eq.disponibilidade >= 85
                                      ? "bg-amber-500"
                                      : "bg-red-500"
                                  }`}
                                  style={{ width: `${Math.min(eq.disponibilidade, 100)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span
                              className={`font-semibold ${
                                eq.confiabilidade >= 60
                                  ? "text-blue-600"
                                  : "text-amber-600"
                              }`}
                            >
                              {fmtPct(eq.confiabilidade)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <StatusBadge
                              value={eq.mtbf}
                              target={targets.mtbf}
                              higherIsBetter
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Metric line charts (TRACTIAN-style) ── */}
        {!loading && data && data.tendencia.length > 0 && (
          <div className="space-y-4">
            {METRIC_CONFIGS.map((cfg) => (
              <Card key={cfg.key} className="border-gray-100">
                <CardContent className="pt-4 pb-4">
                  {/* Card header row */}
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{cfg.label}</p>
                      <button
                        onClick={() => setDrillMetric(cfg)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-0.5"
                      >
                        Visão Detalhada
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                    <span className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded px-2 py-0.5">
                      Mês
                    </span>
                  </div>

                  {/* Chart */}
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart
                      data={data.tendencia}
                      margin={{ top: 22, right: 24, left: 0, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: "#9ca3af" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#9ca3af" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={cfg.fmtY}
                        width={56}
                        domain={cfg.domain}
                      />
                      <Tooltip
                        content={({ active, payload, label }) => (
                          <MetricTooltip
                            active={active}
                            payload={payload as any[]}
                            label={typeof label === "string" ? label : String(label ?? "")}
                            fmtDot={cfg.fmtDot}
                          />
                        )}
                      />
                      <Line
                        type="monotone"
                        dataKey={cfg.key}
                        stroke={cfg.color}
                        strokeWidth={2.5}
                        dot={(props) => (
                          <LabeledDot
                            key={`dot-${props.index}`}
                            cx={props.cx}
                            cy={props.cy}
                            value={props.value}
                            fmtDot={cfg.fmtDot}
                            color={cfg.color}
                          />
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

        {/* Drill-down modal */}
        {drillMetric && (
          <DrillModal
            metric={drillMetric}
            equipamentos={equipamentosFiltrados}
            targets={targets}
            onClose={() => setDrillMetric(null)}
          />
        )}

        {/* ── Info panel ──────────────────────────────────────────────────── */}
        <InfoPanel />

        {/* Footer info */}
        {data && (
          <p className="text-xs text-gray-400 text-right">
            Atualizado em{" "}
            {new Date(data.generatedAt).toLocaleString("pt-BR")} ·{" "}
            Fonte: {data.source === "db" ? "Engeman CMMS" : "Dados simulados"}
          </p>
        )}

      </div>
    </div>
  );
}
