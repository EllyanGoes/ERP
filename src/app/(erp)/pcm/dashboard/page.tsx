"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  ChevronRight,
  Settings2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Database,
  ShieldCheck,
  GitBranch,
  Layers,
  Cpu,
  CheckSquare,
  Square,
  MinusSquare,
  Search,
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
import type { TreeNode, AplicacoesResponse } from "@/app/api/pcm/aplicacoes/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmt1(n: number) { return n.toFixed(1); }
function fmtPct(n: number) { return `${n.toFixed(1)}%`; }

const LS_TARGETS_KEY   = "pcm_targets_v1";
const LS_CACHE_KEY     = "pcm_indicadores_cache_v3";
const CACHE_MAX_AGE_MS = 30 * 60 * 1000;

let _dashMemCache: { data: IndicadoresResponse; key: string } | null = null;

function cacheKey(dias: number, codApls: number[] | null) {
  return `${dias}:${codApls ? codApls.sort((a,b)=>a-b).join(",") : "all"}`;
}

function loadTargets(): { mtbf: number; mttr: number } {
  if (typeof window === "undefined") return { mtbf: 120, mttr: 4 };
  try { const r = localStorage.getItem(LS_TARGETS_KEY); if (r) return JSON.parse(r); } catch {}
  return { mtbf: 120, mttr: 4 };
}
function saveTargets(t: { mtbf: number; mttr: number }) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_TARGETS_KEY, JSON.stringify(t));
}

type CacheEntry = { data: IndicadoresResponse; key: string; savedAt: string };
function saveDataCache(data: IndicadoresResponse, key: string) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(LS_CACHE_KEY, JSON.stringify({ data, key, savedAt: new Date().toISOString() })); } catch {}
}
function loadDataCache(key: string): IndicadoresResponse | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (entry.key !== key) return null;
    const age = Date.now() - new Date(entry.savedAt).getTime();
    return age < CACHE_MAX_AGE_MS ? entry.data : null;
  } catch { return null; }
}
function getCachedData(key: string): IndicadoresResponse | null {
  if (_dashMemCache?.key === key) return _dashMemCache.data;
  const ls = loadDataCache(key);
  if (ls) { _dashMemCache = { data: ls, key }; return ls; }
  return null;
}
function setCachedData(data: IndicadoresResponse, key: string) {
  _dashMemCache = { data, key };
  saveDataCache(data, key);
}

function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
}
function fmtHoras(h: number): string {
  if (h <= 0) return "0h";
  if (h >= 24) { const d = Math.floor(h / 24); const r = Math.round(h % 24); return r > 0 ? `${d}d ${r}h` : `${d}d`; }
  return `${h.toFixed(1)}h`;
}

// ---------------------------------------------------------------------------
// Metric chart configs
// ---------------------------------------------------------------------------
type MetricKey = "mtbfMedio" | "mttrMedio" | "disponibilidade" | "confiabilidade";
interface MetricConfig {
  key: MetricKey; label: string; color: string;
  fmtY: (v: number) => string; fmtDot: (v: number) => string;
  domain?: [number | "auto" | "dataMin", number | "auto" | "dataMax"];
}
const METRIC_CONFIGS: MetricConfig[] = [
  { key: "disponibilidade", label: "Disponibilidade", color: "#22c55e", fmtY: (v) => `${v.toFixed(1)}%`, fmtDot: (v) => `${v.toFixed(2)}%`, domain: ["auto", "dataMax"] },
  { key: "confiabilidade",  label: "Confiabilidade",  color: "#3b82f6", fmtY: (v) => `${v.toFixed(1)}%`, fmtDot: (v) => `${v.toFixed(2)}%`, domain: ["auto", "dataMax"] },
  { key: "mtbfMedio",       label: "MTBF",            color: "#14b8a6", fmtY: fmtHoras, fmtDot: fmtHoras, domain: ["auto", "dataMax"] },
  { key: "mttrMedio",       label: "MTTR",            color: "#f59e0b", fmtY: fmtHoras, fmtDot: fmtHoras, domain: ["auto", "dataMax"] },
];

// ---------------------------------------------------------------------------
// Tree helpers (pure)
// ---------------------------------------------------------------------------
function getDescendantLeaves(node: TreeNode): TreeNode[] {
  if (node.isLeaf) return [node];
  return node.children.flatMap(getDescendantLeaves);
}
function collectAllLeaves(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap(getDescendantLeaves);
}
function filterTreeNodes(nodes: TreeNode[], q: string): TreeNode[] {
  return nodes.flatMap((n) => {
    const match = n.descricao.toLowerCase().includes(q) || n.tag.toLowerCase().includes(q);
    if (n.isLeaf) return match ? [n] : [];
    const filtered = filterTreeNodes(n.children, q);
    if (match || filtered.length > 0) return [{ ...n, children: match ? n.children : filtered }];
    return [];
  });
}

// ---------------------------------------------------------------------------
// TreeNodeRow
// ---------------------------------------------------------------------------
const DEPTH_ICONS   = [Layers, GitBranch, GitBranch, GitBranch];
const DEPTH_TAG_CLR = ["text-indigo-400", "text-blue-300", "text-teal-300", "text-gray-300"];
const DEPTH_ICO_CLR = ["text-indigo-500", "text-blue-400", "text-teal-400", "text-gray-400"];
const DEPTH_LBL_CLS = ["font-bold text-gray-800", "font-semibold text-gray-700", "font-medium text-gray-600", "font-normal text-gray-500"];

interface TreeRowProps {
  node: TreeNode; depth: number;
  expanded: Set<string>; setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>;
  selected: Set<number> | null;
  onToggleGroup: (n: TreeNode) => void; onToggleLeaf: (id: number) => void;
}
function TreeNodeRow({ node, depth, expanded, setExpanded, selected, onToggleGroup, onToggleLeaf }: TreeRowProps) {
  const leaves   = getDescendantLeaves(node);
  const isOpen   = expanded.has(node.taggru);
  const checkSt  = (() => {
    if (!selected) return "all";
    const sel = leaves.filter((l) => selected.has(l.codApl)).length;
    return sel === 0 ? "none" : sel === leaves.length ? "all" : "partial";
  })();
  const indent   = 8 + depth * 18;
  const IconComp  = depth < DEPTH_ICONS.length   ? DEPTH_ICONS[depth]   : GitBranch;
  const iconColor = depth < DEPTH_ICO_CLR.length ? DEPTH_ICO_CLR[depth] : "text-gray-400";
  const tagColor  = depth < DEPTH_TAG_CLR.length ? DEPTH_TAG_CLR[depth] : "text-gray-300";
  const lblCls    = depth < DEPTH_LBL_CLS.length ? DEPTH_LBL_CLS[depth] : "font-normal text-gray-500";
  const iSz = depth === 0 ? "w-3.5 h-3.5" : "w-3 h-3";
  const cSz = depth === 0 ? "w-4 h-4"     : "w-3.5 h-3.5";

  if (node.isLeaf) {
    const sel = !selected || selected.has(node.codApl);
    return (
      <div className="flex items-center gap-1 pr-2 py-0.5 hover:bg-gray-50 cursor-pointer"
        style={{ paddingLeft: `${indent + 20}px` }}
        onClick={() => onToggleLeaf(node.codApl)}>
        <button className="flex-shrink-0 text-blue-500" onClick={(e) => { e.stopPropagation(); onToggleLeaf(node.codApl); }}>
          {sel ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3 text-gray-300" />}
        </button>
        <Cpu className="w-3 h-3 text-gray-400 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className={`text-xs truncate ${sel ? "text-gray-700" : "text-gray-400"}`} title={node.descricao}>{node.descricao}</p>
          <p className="text-[10px] text-blue-400 font-mono">{node.tag}</p>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-1 pr-2 py-0.5 hover:bg-gray-50" style={{ paddingLeft: `${indent}px` }}>
        <button className="p-0.5 text-gray-400 hover:text-gray-600 flex-shrink-0"
          onClick={() => setExpanded((p) => { const n = new Set(p); n.has(node.taggru) ? n.delete(node.taggru) : n.add(node.taggru); return n; })}>
          {isOpen ? <ChevronDown className={iSz} /> : <ChevronRight className={iSz} />}
        </button>
        <button className="flex-shrink-0 text-blue-600" onClick={() => onToggleGroup(node)}>
          {checkSt === "all" ? <CheckSquare className={cSz} /> : checkSt === "partial" ? <MinusSquare className={`${cSz} text-blue-400`} /> : <Square className={`${cSz} text-gray-300`} />}
        </button>
        <IconComp className={`${iSz} ${iconColor} flex-shrink-0`} />
        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onToggleGroup(node)}>
          <p className={`text-xs ${lblCls} truncate`} title={node.descricao}>{node.descricao}</p>
          <p className={`text-[10px] font-mono ${tagColor}`}>{node.tag}</p>
        </div>
        <span className="text-[10px] text-gray-300 flex-shrink-0 ml-1">{leaves.length}</span>
      </div>
      {isOpen && node.children.map((child) => (
        <TreeNodeRow key={child.taggru} node={child} depth={depth + 1}
          expanded={expanded} setExpanded={setExpanded}
          selected={selected} onToggleGroup={onToggleGroup} onToggleLeaf={onToggleLeaf} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LabeledDot
// ---------------------------------------------------------------------------
function LabeledDot(props: { cx?: number; cy?: number; value?: number; fmtDot: (v: number) => string; color: string }) {
  const { cx = 0, cy = 0, value = 0, fmtDot, color } = props;
  return (
    <g>
      <circle cx={cx} cy={cy} r={5} fill={color} stroke="white" strokeWidth={2} />
      <text x={cx} y={cy - 10} textAnchor="middle" fontSize={10} fontWeight={600} fill="#374151">{fmtDot(value)}</text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Info Panel
// ---------------------------------------------------------------------------
const INFO_ITEMS = [
  { icon: HelpCircle, color: "text-blue-500",  bg: "bg-blue-50",
    title: "Por que nem todos os ativos aparecem nos gráficos?",
    body:  "Os gráficos exibem apenas equipamentos com ao menos 1 OS corretiva fechada (CODDEF registrado) no período. Ativos sem histórico de falhas não influenciam os indicadores." },
  { icon: Info, color: "text-teal-500", bg: "bg-teal-50",
    title: "É necessário ter escala de trabalho pré-definida?",
    body:  "Não. O cálculo usa o período selecionado (ex.: 365 dias × 24 h = 8.760 h) como base para MTBF e Disponibilidade, sem depender de calendário de turnos." },
];
function InfoPanel() {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
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
              <div className={`flex-shrink-0 p-2 rounded-lg h-fit ${item.bg}`}><item.icon className={`w-4 h-4 ${item.color}`} /></div>
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
function KpiCard({ title, value, subtitle, icon: Icon, color, bg, trend, info }: {
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
                    <TooltipTrigger className="text-gray-400 hover:text-gray-600 flex-shrink-0 cursor-default"><Info className="w-3.5 h-3.5" /></TooltipTrigger>
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
          <div className={`p-2 rounded-lg ${bg} flex-shrink-0 ml-2`}><Icon className={`w-5 h-5 ${color}`} /></div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function PCMDashboardPage() {
  const [dias, setDias]       = useState(365);
  const [data, setData]       = useState<IndicadoresResponse | null>(() => getCachedData(cacheKey(365, null)));
  const [loading, setLoading] = useState<boolean>(() => getCachedData(cacheKey(365, null)) === null);
  const [engemanOffline, setEngemanOffline] = useState(false);
  const [refreshing, setRefreshing]         = useState(false);
  const [showTargets, setShowTargets]       = useState(false);
  const [targets, setTargets]               = useState<{ mtbf: number; mttr: number }>({ mtbf: 120, mttr: 4 });
  const [targetInput, setTargetInput]       = useState({ mtbf: "120", mttr: "4" });

  // ── Tree filter ────────────────────────────────────────────────────────────
  const [showTreePopover, setShowTreePopover] = useState(false);
  const [treeSelected, setTreeSelected]       = useState<Set<number> | null>(null); // null = todos
  const [pendingSelected, setPendingSelected] = useState<Set<number> | null>(null);
  const [treeExpanded, setTreeExpanded]       = useState<Set<string>>(new Set());
  const [treeSearch, setTreeSearch]           = useState("");
  const [allTree, setAllTree]                 = useState<TreeNode[]>([]);
  const [loadingTree, setLoadingTree]         = useState(false);
  const treePopoverRef                        = useRef<HTMLDivElement>(null);

  // ── Targets ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = loadTargets(); setTargets(t); setTargetInput({ mtbf: String(t.mtbf), mttr: String(t.mttr) });
  }, []);

  // ── Fetch indicators ───────────────────────────────────────────────────────
  const fetchData = useCallback(async (background = false) => {
    const codApls = treeSelected ? Array.from(treeSelected) : null;
    const key = cacheKey(dias, codApls);
    if (background) setRefreshing(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams({ dias: String(dias) });
      if (codApls && codApls.length > 0) params.set("codApls", codApls.join(","));
      const res = await fetch(`/api/pcm/indicadores?${params}`);
      if (res.status === 503) { setEngemanOffline(true); if (!background) setData(null); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: IndicadoresResponse = await res.json();
      setEngemanOffline(false); setData(json); setCachedData(json, key);
    } catch { if (!background) setData(null); }
    finally { if (background) setRefreshing(false); else setLoading(false); }
  }, [dias, treeSelected]);

  useEffect(() => {
    const key = cacheKey(dias, treeSelected ? Array.from(treeSelected) : null);
    const cached = getCachedData(key);
    if (cached) { setData(cached); setLoading(false); fetchData(true); }
    else { setData(null); setLoading(true); fetchData(false); }
  }, [fetchData, dias, treeSelected]);

  // ── Load tree ──────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoadingTree(true);
    fetch("/api/pcm/aplicacoes")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j: AplicacoesResponse) => setAllTree(j.tree))
      .catch(() => {})
      .finally(() => setLoadingTree(false));
  }, []);

  // Expand top-level on first load
  useEffect(() => {
    if (allTree.length > 0 && treeExpanded.size === 0) setTreeExpanded(new Set(allTree.map((n) => n.taggru)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTree]);

  // Sync pending ← applied when popover opens; clear search on close
  useEffect(() => {
    if (showTreePopover) setPendingSelected(treeSelected === null ? null : new Set(treeSelected));
    else setTreeSearch("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTreePopover]);

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (treePopoverRef.current && !treePopoverRef.current.contains(e.target as Node)) setShowTreePopover(false);
    }
    if (showTreePopover) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showTreePopover]);

  // Expand search matches
  useEffect(() => {
    if (treeSearch.trim()) {
      const keys = new Set<string>();
      const collect = (nodes: TreeNode[]) => { for (const n of nodes) { if (!n.isLeaf) { keys.add(n.taggru); collect(n.children); } } };
      collect(treeNodes);
      setTreeExpanded(keys);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeSearch]);

  // ── Tree helpers ───────────────────────────────────────────────────────────
  const allCodApls = useMemo(() => new Set(collectAllLeaves(allTree).map((l) => l.codApl)), [allTree]);

  const treeNodes = useMemo(() => {
    if (!treeSearch.trim()) return allTree;
    return filterTreeNodes(allTree, treeSearch.toLowerCase());
  }, [allTree, treeSearch]);

  function toggleGroup(node: TreeNode) {
    const ids = getDescendantLeaves(node).map((l) => l.codApl);
    setPendingSelected((prev) => {
      const base = prev ?? allCodApls;
      const allSel = ids.every((id) => base.has(id));
      const next = new Set(base);
      if (allSel) ids.forEach((id) => next.delete(id)); else ids.forEach((id) => next.add(id));
      return next.size === allCodApls.size ? null : next;
    });
  }
  function toggleLeaf(codApl: number) {
    setPendingSelected((prev) => {
      const base = prev ?? new Set(allCodApls);
      const next = new Set(base);
      next.has(codApl) ? next.delete(codApl) : next.add(codApl);
      return next.size === allCodApls.size ? null : next;
    });
  }
  function applyTreeFilter() { setTreeSelected(pendingSelected); setShowTreePopover(false); }

  // ── KPIs ───────────────────────────────────────────────────────────────────
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
          {payload.map((p: any) => <p key={p.dataKey} style={{ color: p.color }} className="font-bold text-sm">{fmtDot(p.value)}</p>)}
        </div>
      );
    }
    return null;
  }

  // Label for the filter button
  const filterLabel = treeSelected === null
    ? "Todos os ativos"
    : treeSelected.size === 1
      ? (() => { const leaf = collectAllLeaves(allTree).find((l) => treeSelected.has(l.codApl)); return leaf ? `${leaf.tag} — ${leaf.descricao}` : `${treeSelected.size} ativo`; })()
      : `${treeSelected.size} ativos selecionados`;

  return (
    <div>
      <PageHeader
        title="Resultados"
        subtitle="Planejamento e Controle de Manutenção — MTBF · MTTR · Confiabilidade"
        breadcrumbs={[{ label: "Menu" }, { label: "PCM" }, { label: "Dashboard" }]}
        actions={
          <div className="flex items-center gap-2">
            {data?.generatedAt && <span className="text-xs text-gray-400 hidden sm:block">Atualizado às {fmtTime(data.generatedAt)}</span>}
            {engemanOffline ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border bg-red-50 border-red-200 text-red-700">
                <Database className="w-3.5 h-3.5" /><span className="w-2 h-2 rounded-full bg-red-500" />Engeman inacessível
              </div>
            ) : data && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border bg-green-50 border-green-200 text-green-700">
                <Database className="w-3.5 h-3.5" /><span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.6)]" />Engeman online
              </div>
            )}
            <Link href="/pcm/qualidade"><Button variant="outline" size="sm" className="gap-1.5"><ShieldCheck className="w-4 h-4" />Qualidade dos dados</Button></Link>
            <Button variant="outline" size="sm" onClick={() => setShowTargets((v) => !v)} className="gap-1"><Settings2 className="w-4 h-4" />Metas</Button>
            <Button variant="outline" size="sm" onClick={() => fetchData(false)} disabled={loading || refreshing} className="gap-1">
              <RefreshCw className={`w-4 h-4 ${loading || refreshing ? "animate-spin" : ""}`} />Atualizar
            </Button>
          </div>
        }
      />

      <div className="px-8 pb-8 space-y-6">

        {/* Metas */}
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
                <div className="text-xs text-gray-400 ml-auto">Valores salvos no navegador</div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Filtros ─────────────────────────────────────────────────────── */}
        <div className="flex items-end gap-3 flex-wrap">

          {/* Filtro de Aplicações — árvore TAGGRU */}
          <div className="relative" ref={treePopoverRef}>
            <Label className="text-xs text-gray-500 mb-1 block">Aplicação</Label>
            <Button
              variant={treeSelected !== null ? "default" : "outline"}
              size="sm"
              onClick={() => setShowTreePopover((v) => !v)}
              className={`gap-1.5 h-8 max-w-[280px] truncate ${treeSelected !== null ? "bg-blue-600 hover:bg-blue-700" : ""}`}
            >
              <GitBranch className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{filterLabel}</span>
              {treeSelected !== null && treeSelected.size > 1 && (
                <span className="ml-0.5 bg-white text-blue-600 text-[10px] font-bold rounded-full px-1.5 leading-4 flex-shrink-0">
                  {treeSelected.size}
                </span>
              )}
            </Button>

            {/* Popover */}
            {showTreePopover && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-white rounded-xl border border-gray-200 shadow-xl w-[420px] flex flex-col max-h-[600px]">
                {/* Busca */}
                <div className="p-2 border-b border-gray-100">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input autoFocus
                      className="w-full pl-8 pr-3 h-8 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Buscar por TAG ou nome..."
                      value={treeSearch}
                      onChange={(e) => setTreeSearch(e.target.value)}
                    />
                  </div>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 bg-gray-50/60 text-xs">
                  <button onClick={() => setPendingSelected(null)}           className="text-blue-600 hover:text-blue-700 font-medium">Todos</button>
                  <span className="text-gray-200">|</span>
                  <button onClick={() => setPendingSelected(new Set())}      className="text-gray-500 hover:text-gray-700">Nenhum</button>
                  <span className="text-gray-200">|</span>
                  <button onClick={() => { const k = new Set<string>(); const f = (ns: TreeNode[]) => { for (const n of ns) { if (!n.isLeaf) { k.add(n.taggru); f(n.children); } } }; f(allTree); setTreeExpanded(k); }}
                    className="text-gray-500 hover:text-gray-700 flex items-center gap-0.5">
                    <ChevronDown className="w-3 h-3" />Abrir todos
                  </button>
                  <span className="text-gray-200">|</span>
                  <button onClick={() => setTreeExpanded(new Set())} className="text-gray-500 hover:text-gray-700 flex items-center gap-0.5">
                    <ChevronRight className="w-3 h-3" />Recolher
                  </button>
                  <span className="ml-auto text-gray-400">{pendingSelected === null ? allCodApls.size : pendingSelected.size}/{allCodApls.size}</span>
                </div>

                {/* Árvore */}
                <div className="overflow-y-auto flex-1 py-1">
                  {loadingTree ? (
                    <div className="flex items-center justify-center py-6 text-gray-400 text-xs gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Carregando...</div>
                  ) : treeNodes.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">Nenhum resultado</p>
                  ) : treeNodes.map((node) => (
                    <TreeNodeRow key={node.taggru} node={node} depth={0}
                      expanded={treeExpanded} setExpanded={setTreeExpanded}
                      selected={pendingSelected}
                      onToggleGroup={toggleGroup} onToggleLeaf={toggleLeaf} />
                  ))}
                </div>

                {/* Rodapé */}
                <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-gray-100 bg-gray-50/60">
                  <button onClick={() => setShowTreePopover(false)} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                    Cancelar
                  </button>
                  <button onClick={applyTreeFilter} className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-lg transition-colors">
                    Aplicar filtro
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Período */}
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Período</Label>
            <Select value={String(dias)} onValueChange={(v) => setDias(Number(v))}>
              <SelectTrigger className="w-44 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
                <SelectItem value="180">Últimos 180 dias</SelectItem>
                <SelectItem value="365">Últimos 12 meses</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Badge de seleção ativa */}
          {treeSelected !== null && (
            <div className="flex items-center gap-1.5 h-8 self-end">
              <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded-full font-medium">
                Filtro ativo: {treeSelected.size} ativo{treeSelected.size !== 1 ? "s" : ""}
              </span>
              <button onClick={() => setTreeSelected(null)} className="text-xs text-gray-400 hover:text-gray-600 underline self-end pb-1">
                limpar
              </button>
            </div>
          )}
        </div>

        {/* ── KPI Cards — 4 colunas ─────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-4">
          <KpiCard title="Média MTBF" value={`${fmt1(kpis.mtbf)}h`} subtitle={`Meta: ${targets.mtbf}h entre falhas`}
            icon={Activity} color={kpis.mtbf >= targets.mtbf ? "text-blue-600" : "text-red-600"} bg={kpis.mtbf >= targets.mtbf ? "bg-blue-50" : "bg-red-50"} trend={kpis.mtbf >= targets.mtbf ? "up" : "down"}
            info={<span><strong>MTBF</strong> — Tempo Médio Entre Falhas<br />Período ÷ nº de falhas (CODDEF IS NOT NULL).</span>} />
          <KpiCard title="Média MTTR" value={`${fmt1(kpis.mttr)}h`} subtitle={`Meta: ≤ ${targets.mttr}h para reparar`}
            icon={AlertTriangle} color={kpis.mttr <= targets.mttr ? "text-green-600" : "text-red-600"} bg={kpis.mttr <= targets.mttr ? "bg-green-50" : "bg-red-50"} trend={kpis.mttr <= targets.mttr ? "up" : "down"}
            info={<span><strong>MTTR</strong> — Tempo Médio Para Reparar<br />Horas reparo ÷ nº falhas (MAQPAR→MAQFUN ou HOREXEREA).</span>} />
          <KpiCard title="Disponibilidade Média" value={fmtPct(kpis.disp)} subtitle="MTBF / (MTBF + MTTR) × 100"
            icon={TrendingUp} color={kpis.disp >= 95 ? "text-green-600" : kpis.disp >= 85 ? "text-amber-600" : "text-red-600"} bg={kpis.disp >= 95 ? "bg-green-50" : kpis.disp >= 85 ? "bg-amber-50" : "bg-red-50"} trend={kpis.disp >= 90 ? "up" : "down"}
            info={<span><strong>Disponibilidade</strong><br />MTBF ÷ (MTBF + MTTR) × 100.</span>} />
          <KpiCard title="Confiabilidade Média" value={fmtPct(kpis.conf)} subtitle="Probabilidade de operar 90 dias sem falha"
            icon={Activity} color={kpis.conf >= 60 ? "text-blue-600" : "text-amber-600"} bg={kpis.conf >= 60 ? "bg-blue-50" : "bg-amber-50"} trend={kpis.conf >= 60 ? "up" : "down"}
            info={<span><strong>Confiabilidade R(90d)</strong><br />EXP(−n ÷ 8760 × 2160) × 100 — fórmula Engeman nativa.</span>} />
        </div>

        {/* ── Gráficos de Tendência ────────────────────────────────────────── */}
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
                      <Tooltip content={({ active, payload, label }) => (
                        <MetricTooltip active={active} payload={payload as any[]} label={typeof label === "string" ? label : String(label ?? "")} fmtDot={cfg.fmtDot} />
                      )} />
                      <Line type="monotone" dataKey={cfg.key} stroke={cfg.color} strokeWidth={2.5}
                        dot={(props) => <LabeledDot key={`dot-${props.index}`} cx={props.cx} cy={props.cy} value={props.value} fmtDot={cfg.fmtDot} color={cfg.color} />}
                        activeDot={{ r: 6, fill: cfg.color, stroke: "white", strokeWidth: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Loading / offline */}
        {loading && (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />Carregando dados do Engeman…
          </div>
        )}
        {!loading && engemanOffline && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-sm">
            <Database className="w-10 h-10 text-red-300" />
            <p className="font-semibold text-red-600">Engeman inacessível</p>
            <p className="text-gray-400 text-center max-w-sm">Disponível apenas na rede local (192.168.0.206).</p>
            <Button variant="outline" size="sm" className="gap-1.5 mt-1" onClick={() => fetchData(false)}><RefreshCw className="w-4 h-4" />Tentar novamente</Button>
          </div>
        )}

        <InfoPanel />

        {data && <p className="text-xs text-gray-400 text-right">Atualizado em {new Date(data.generatedAt).toLocaleString("pt-BR")} · Fonte: Engeman CMMS</p>}
      </div>
    </div>
  );
}
