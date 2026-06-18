"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  AlertTriangle,
  Search,
  RefreshCw,
  Clock,
  BarChart2,
  ChevronDown,
  X,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";
import type { TreeNode, AplicacoesResponse } from "@/app/api/pcm/aplicacoes/route";
import type { MtbfAplicacaoResponse, MtbfMensal } from "@/app/api/pcm/relatorio-mtbf/route";

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtHoras(h: number | null): string {
  if (h == null) return "—";
  if (h <= 0)    return "0 h";
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const r = Math.round(h % 24);
    return r > 0 ? `${d}d ${r}h` : `${d}d`;
  }
  return `${h.toFixed(1)} h`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("pt-BR"); } catch { return "—"; }
}

// Flatten tree into a sorted list for the application combobox
function flattenTree(nodes: TreeNode[], depth = 0): Array<{ codApl: number; tag: string; descricao: string; indent: number }> {
  const result: Array<{ codApl: number; tag: string; descricao: string; indent: number }> = [];
  for (const n of nodes) {
    result.push({ codApl: n.codApl, tag: n.tag, descricao: n.descricao, indent: depth });
    if (n.children.length > 0) {
      result.push(...flattenTree(n.children, depth + 1));
    }
  }
  return result;
}

// ── Tendência badge ───────────────────────────────────────────────────────────
function TendenciaBadge({ tendencia }: { tendencia: MtbfMensal[] }) {
  const valid = tendencia.filter((t) => t.mtbf != null && t.mtbf > 0);
  if (valid.length < 2) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="w-3.5 h-3.5" /> Sem tendência
      </span>
    );
  }
  const first = valid[0].mtbf!;
  const last  = valid[valid.length - 1].mtbf!;
  const pct   = ((last - first) / first) * 100;

  if (pct >= 2) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
        <TrendingUp className="w-3.5 h-3.5" /> +{pct.toFixed(1)}% vs. 6 meses
      </span>
    );
  }
  if (pct <= -2) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500">
        <TrendingDown className="w-3.5 h-3.5" /> {pct.toFixed(1)}% vs. 6 meses
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Minus className="w-3.5 h-3.5" /> Estável ({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)
    </span>
  );
}

// ── Custom Tooltip do gráfico ─────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value;
  return (
    <div className="bg-card border border-border rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      <p className="text-info font-bold">{fmtHoras(v ?? null)}</p>
    </div>
  );
}

// ── Dot com label no gráfico ──────────────────────────────────────────────────
function LabeledDot(props: {
  cx?: number; cy?: number; payload?: MtbfMensal;
  value?: number; index?: number; dataLength?: number;
}) {
  const { cx = 0, cy = 0, value, index = 0, dataLength = 0 } = props;
  if (value == null) return null;
  const isFirst = index === 0;
  const isLast  = index === dataLength - 1;
  const showLabel = isFirst || isLast || dataLength <= 4;
  return (
    <g>
      <circle cx={cx} cy={cy} r={4} fill="#3b82f6" stroke="#fff" strokeWidth={2} />
      {showLabel && (
        <text
          x={cx}
          y={cy - 10}
          textAnchor="middle"
          fontSize={10}
          fill="#3b82f6"
          fontWeight={600}
        >
          {fmtHoras(value)}
        </text>
      )}
    </g>
  );
}

// ── Application Combobox (portal-based to avoid overflow clipping) ────────────
function AplicacaoCombobox({
  options,
  value,
  onChange,
  loading,
}: {
  options: Array<{ codApl: number; tag: string; descricao: string; indent: number }>;
  value: number | null;
  onChange: (codApl: number) => void;
  loading: boolean;
}) {
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState("");
  const [mounted, setMounted] = useState(false);
  const [pos, setPos]       = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef          = useRef<HTMLButtonElement>(null);
  const searchRef           = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const selected = options.find((o) => o.codApl === value);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter(
      (o) => o.tag.toLowerCase().includes(q) || o.descricao.toLowerCase().includes(q)
    );
  }, [options, query]);

  function openDropdown() {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX, width: r.width });
    }
    setOpen(true);
    setQuery("");
    // focus the search input on next tick
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement)?.closest?.("[data-apl-dropdown]")
      ) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Close on scroll
  useEffect(() => {
    if (!open) return;
    function onScroll() { setOpen(false); }
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [open]);

  const dropdown = open && mounted && pos
    ? createPortal(
        <div
          data-apl-dropdown
          className="fixed z-[9999] bg-card border border-border rounded-xl shadow-xl overflow-hidden"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          {/* Search */}
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por TAG ou descrição…"
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>
          {/* List */}
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-xs text-muted-foreground italic text-center">Nenhuma aplicação encontrada.</p>
            ) : filtered.map((o) => (
              <button
                key={o.codApl}
                type="button"
                onMouseDown={() => {
                  onChange(o.codApl);
                  setOpen(false);
                  setQuery("");
                }}
                className={cn(
                  "w-full text-left py-2.5 text-sm hover:bg-info/10 border-b border-gray-50 last:border-0",
                  "flex items-center gap-2",
                  o.codApl === value && "bg-info/10 text-info"
                )}
                style={{ paddingLeft: `${16 + o.indent * 12}px`, paddingRight: 16 }}
              >
                <span className="font-mono text-[11px] text-muted-foreground shrink-0">{o.tag}</span>
                <span className="truncate text-foreground">{o.descricao}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => open ? setOpen(false) : openDropdown()}
        disabled={loading}
        className={cn(
          "w-full h-10 px-3 pr-8 text-left text-sm border rounded-lg bg-card",
          "flex items-center justify-between gap-2",
          "focus:outline-none focus:ring-2 focus:ring-blue-500",
          loading ? "border-border text-muted-foreground/60" : "border-border text-foreground hover:border-border"
        )}
      >
        <span className="truncate">
          {loading ? "Carregando aplicações…" : (
            selected
              ? <><span className="font-mono text-muted-foreground mr-1.5 text-xs">{selected.tag}</span>{selected.descricao}</>
              : <span className="text-muted-foreground">Selecionar aplicação…</span>
          )}
        </span>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {value != null && value > 0 && !loading && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onChange(0); setQuery(""); }}
          className="absolute right-7 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground"
          title="Limpar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      {dropdown}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function RelatorioMtbfPage() {
  // Aplicações
  const [aplicacoes, setAplicacoes] = useState<Array<{ codApl: number; tag: string; descricao: string; indent: number }>>([]);
  const [loadingApl, setLoadingApl] = useState(true);

  // Seleção
  const [codAplSel,  setCodAplSel]  = useState<number | null>(null);
  const [codemp,     setCodemp]     = useState("1");
  const [dataInicio, setDataInicio] = useState("");   // "YYYY-MM-DD"
  const [dataFim,    setDataFim]    = useState("");

  // Resultado
  const [resultado, setResultado] = useState<MtbfAplicacaoResponse | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");

  // ── Carrega árvore de aplicações e achata ─────────────────────────────────
  useEffect(() => {
    setLoadingApl(true);
    fetch("/api/pcm/aplicacoes")
      .then((r) => r.json())
      .then((j: AplicacoesResponse) => {
        setAplicacoes(flattenTree(j.tree ?? []));
      })
      .catch(() => {})
      .finally(() => setLoadingApl(false));
  }, []);

  // ── Buscar MTBF ────────────────────────────────────────────────────────────
  const buscar = useCallback(async () => {
    if (!codAplSel) { setError("Selecione uma aplicação."); return; }
    if (dataInicio && dataFim && dataInicio > dataFim) {
      setError("Data Início não pode ser maior que Data Fim."); return;
    }
    setError("");
    setLoading(true);
    setResultado(null);
    try {
      const params = new URLSearchParams({ codApl: String(codAplSel), codemp });
      if (dataInicio) params.set("dataInicio", dataInicio);
      if (dataFim)    params.set("dataFim",    dataFim);
      const res  = await fetch(`/api/pcm/relatorio-mtbf?${params}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Erro ao carregar dados."); return; }
      setResultado(json as MtbfAplicacaoResponse);
    } catch {
      setError("Erro de conexão com o servidor.");
    } finally {
      setLoading(false);
    }
  }, [codAplSel, codemp, dataInicio, dataFim]);

  // Calcular média da tendência para linha de referência
  const mediasMtbf = useMemo(() => {
    if (!resultado?.tendencia?.length) return null;
    const valid = resultado.tendencia.filter((t) => t.mtbf != null && t.mtbf > 0);
    if (!valid.length) return null;
    return parseFloat((valid.reduce((s, t) => s + t.mtbf!, 0) / valid.length).toFixed(2));
  }, [resultado]);

  // Cor do MTBF card
  const mtbfColor = useMemo(() => {
    const v = resultado?.mtbfAtual;
    if (v == null) return "text-muted-foreground";
    if (v >= 100) return "text-success";
    if (v >= 40)  return "text-amber-500";
    return "text-red-500";
  }, [resultado]);

  return (
    <div>
      <PageHeader
        title="Relatório de MTBF"
        breadcrumbs={[
          { label: "PCM" },
          { label: "Relatório de MTBF" },
        ]}
      />

      <div className="px-8 pb-8 space-y-6 max-w-5xl">

        {/* ── Filtros ────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Activity className="w-4 h-4 text-orange-500" />
              Parâmetros
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Linha 1: Aplicação + Empresa */}
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[280px] space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Aplicação <span className="text-red-500">*</span>
                </Label>
                <AplicacaoCombobox
                  options={aplicacoes}
                  value={codAplSel}
                  onChange={(v) => { setCodAplSel(v || null); setResultado(null); }}
                  loading={loadingApl}
                />
              </div>
              <div className="w-28 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Empresa (CODEMP)</Label>
                <Input
                  value={codemp}
                  onChange={(e) => setCodemp(e.target.value)}
                  className="h-10 text-sm"
                  placeholder="1"
                />
              </div>
            </div>

            {/* Linha 2: Período + Botão */}
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Data Início</Label>
                <div className="relative">
                  <Input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => { setDataInicio(e.target.value); setResultado(null); }}
                    className="h-10 text-sm w-44 pr-8"
                  />
                  {dataInicio && (
                    <button
                      type="button"
                      onClick={() => { setDataInicio(""); setResultado(null); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Data Fim</Label>
                <div className="relative">
                  <Input
                    type="date"
                    value={dataFim}
                    onChange={(e) => { setDataFim(e.target.value); setResultado(null); }}
                    className="h-10 text-sm w-44 pr-8"
                  />
                  {dataFim && (
                    <button
                      type="button"
                      onClick={() => { setDataFim(""); setResultado(null); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {/* Atalhos rápidos */}
              <div className="flex gap-1.5 pb-0.5">
                {[
                  { label: "30d",  days: 30 },
                  { label: "90d",  days: 90 },
                  { label: "6m",   days: 180 },
                  { label: "1a",   days: 365 },
                ].map(({ label, days }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      const fim   = new Date();
                      const ini   = new Date(fim);
                      ini.setDate(ini.getDate() - days);
                      setDataInicio(ini.toISOString().slice(0, 10));
                      setDataFim(fim.toISOString().slice(0, 10));
                      setResultado(null);
                    }}
                    className="px-2.5 py-1 text-xs font-medium rounded-md border border-border text-muted-foreground hover:border-orange-400 hover:text-orange-600 hover:bg-warning/10 transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Button
                onClick={buscar}
                disabled={loading || !codAplSel}
                className="h-10 gap-2 ml-auto"
              >
                {loading ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Calculando…</>
                ) : (
                  <><BarChart2 className="w-4 h-4" /> Calcular MTBF</>
                )}
              </Button>
            </div>

            {/* Período ativo */}
            {(dataInicio || dataFim) && (
              <p className="text-xs text-orange-600 bg-warning/10 border border-orange-100 rounded-lg px-3 py-2 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                Período filtrado: <strong>{dataInicio ? new Date(dataInicio + "T12:00:00").toLocaleDateString("pt-BR") : "início"}</strong>
                {" até "}
                <strong>{dataFim ? new Date(dataFim + "T12:00:00").toLocaleDateString("pt-BR") : "hoje"}</strong>
                <button
                  type="button"
                  onClick={() => { setDataInicio(""); setDataFim(""); setResultado(null); }}
                  className="ml-auto text-orange-400 hover:text-orange-600 underline text-xs"
                >
                  Limpar
                </button>
              </p>
            )}

            {error && (
              <div className="mt-3 flex items-center gap-2 text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-4 py-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Resultado ──────────────────────────────────────────────────── */}
        {resultado && (
          <>
            {/* Identificação da aplicação */}
            <div className="flex items-center gap-2 px-1">
              <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                {resultado.tag}
              </span>
              <span className="text-sm font-medium text-foreground">{resultado.descricao}</span>
            </div>

            {/* ── KPI Cards ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

              {/* MTBF Atual */}
              <Card className="border-2 border-info/20 bg-gradient-to-br from-blue-50 to-white">
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                        MTBF Atual
                      </p>
                      <p className={cn("text-4xl font-bold tracking-tight", mtbfColor)}>
                        {resultado.mtbfAtual != null
                          ? resultado.mtbfAtual >= 24
                            ? `${(resultado.mtbfAtual / 24).toFixed(1)}d`
                            : `${resultado.mtbfAtual.toFixed(1)}h`
                          : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {resultado.mtbfAtual != null && resultado.mtbfAtual >= 24
                          ? `${resultado.mtbfAtual.toFixed(1)} horas`
                          : "horas entre falhas"}
                      </p>
                    </div>
                    <div className="p-2 bg-info/15 rounded-lg">
                      <Clock className="w-5 h-5 text-info" />
                    </div>
                  </div>
                  {/* Fórmula */}
                  <div className="mt-3 pt-3 border-t border-info/20">
                    <p className="text-[10px] text-muted-foreground font-mono leading-tight">
                      ROUND(DATEDIFF(min, t₀, tₙ) / 60, 2) / n_OS
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Total de Falhas */}
              <Card>
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                        Total de O.S. (falhas)
                      </p>
                      <p className="text-4xl font-bold text-foreground">
                        {resultado.totalFalhas}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        com defeito registrado
                      </p>
                    </div>
                    <div className="p-2 bg-warning/15 rounded-lg">
                      <AlertTriangle className="w-5 h-5 text-orange-500" />
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-border text-[11px] text-muted-foreground">
                    <p>REGSERV.CODDEF IS NOT NULL</p>
                  </div>
                </CardContent>
              </Card>

              {/* Período */}
              <Card>
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                        Período analisado
                      </p>
                      <p className="text-sm font-bold text-foreground mt-1">
                        {fmtDate(resultado.dataInicio)}
                      </p>
                      <p className="text-xs text-muted-foreground">até</p>
                      <p className="text-sm font-bold text-foreground">
                        {fmtDate(resultado.dataFim)}
                      </p>
                    </div>
                    <div className="p-2 bg-muted rounded-lg">
                      <Activity className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-border">
                    <TendenciaBadge tendencia={resultado.tendencia} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── Gráfico de tendência ───────────────────────────────────── */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-blue-500" />
                    Tendência MTBF — Últimos 6 meses
                  </CardTitle>
                  {mediasMtbf != null && (
                    <span className="text-xs text-muted-foreground">
                      Média: <span className="font-semibold text-muted-foreground">{fmtHoras(mediasMtbf)}</span>
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                {resultado.tendencia.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
                    <AlertTriangle className="w-8 h-8 text-muted-foreground/60" />
                    <p className="text-sm">Sem dados nos últimos 6 meses para esta aplicação.</p>
                  </div>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={resultado.tendencia.map((t) => ({ ...t, mtbf: t.mtbf ?? undefined }))}
                        margin={{ top: 24, right: 20, left: 0, bottom: 4 }}
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
                          tickFormatter={(v: number) => `${v}h`}
                          width={42}
                        />
                        <Tooltip content={<ChartTooltip />} />
                        {mediasMtbf != null && (
                          <ReferenceLine
                            y={mediasMtbf}
                            stroke="#94a3b8"
                            strokeDasharray="4 4"
                            label={{
                              value: `Média ${fmtHoras(mediasMtbf)}`,
                              position: "insideTopRight",
                              fontSize: 10,
                              fill: "#94a3b8",
                            }}
                          />
                        )}
                        <Line
                          type="monotone"
                          dataKey="mtbf"
                          stroke="#3b82f6"
                          strokeWidth={2.5}
                          connectNulls={false}
                          dot={(props) => (
                            <LabeledDot
                              {...props}
                              dataLength={resultado.tendencia.length}
                            />
                          )}
                          activeDot={{ r: 5, fill: "#2563eb" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Tabela de suporte */}
                {resultado.tendencia.length > 0 && (
                  <div className="mt-4 border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted border-b border-border">
                        <tr>
                          <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Mês</th>
                          <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Falhas (OS)</th>
                          <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">MTBF</th>
                          <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">vs. Média</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {resultado.tendencia.map((t) => {
                          const diff = (mediasMtbf != null && t.mtbf != null)
                            ? ((t.mtbf - mediasMtbf) / mediasMtbf) * 100
                            : null;
                          return (
                            <tr key={t.mes} className="hover:bg-muted">
                              <td className="px-4 py-2 text-sm font-medium text-foreground">{t.label}</td>
                              <td className="px-4 py-2 text-right text-sm text-muted-foreground">{t.falhas}</td>
                              <td className="px-4 py-2 text-right font-semibold text-sm">
                                {t.mtbf != null
                                  ? <span className={t.mtbf >= (mediasMtbf ?? 0) ? "text-success" : "text-red-500"}>{fmtHoras(t.mtbf)}</span>
                                  : <span className="text-muted-foreground text-xs">1 OS (sem intervalo)</span>
                                }
                              </td>
                              <td className="px-4 py-2 text-right text-xs">
                                {diff != null ? (
                                  <span className={cn(
                                    "inline-flex items-center gap-0.5 font-semibold",
                                    diff >= 0 ? "text-success" : "text-red-500"
                                  )}>
                                    {diff >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                    {diff >= 0 ? "+" : ""}{diff.toFixed(1)}%
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/60">—</span>
                                )}
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

            {/* Nota metodológica */}
            <div className="text-xs text-muted-foreground bg-muted border border-border rounded-lg px-4 py-3 space-y-1">
              <p className="font-semibold text-muted-foreground">Metodologia de cálculo</p>
              <p><strong>MTBF Atual:</strong> ROUND(DATEDIFF(min, 1ª OS, última OS) / 60, 2) / n° de OS — intervalo total entre a primeira e a última falha confirmada (CODDEF IS NOT NULL), dividido pelo número de ordens de serviço.</p>
              <p><strong>Tendência (6 meses):</strong> mesma fórmula aplicada mês a mês. Meses com apenas 1 OS exibem "1 OS (sem intervalo)" pois o DATEDIFF seria zero.</p>
              <p><strong>Filiais excluídas:</strong> CODFIL = 000.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
