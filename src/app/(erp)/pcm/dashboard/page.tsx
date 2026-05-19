"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  ChevronsUpDown,
  Settings2,
  RefreshCw,
  Search,
  TrendingUp,
  TrendingDown,
  Database,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";
import type { IndicadorEquipamento, TendenciaMensal, IndicadoresResponse } from "@/app/api/pcm/indicadores/route";

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

const LS_TARGETS_KEY = "pcm_targets_v1";

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
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("mtbf");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [localFilter, setLocalFilter] = useState("all");
  const [showTargets, setShowTargets] = useState(false);
  const [targets, setTargets] = useState<{ mtbf: number; mttr: number }>({ mtbf: 120, mttr: 4 });
  const [targetInput, setTargetInput] = useState({ mtbf: "120", mttr: "4" });

  // Load targets from localStorage on mount
  useEffect(() => {
    const t = loadTargets();
    setTargets(t);
    setTargetInput({ mtbf: String(t.mtbf), mttr: String(t.mttr) });
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pcm/indicadores?dias=${dias}`);
      const json: IndicadoresResponse = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [dias]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Locais vindos da API (já filtrados)
  const locations = useMemo(() => data?.locais ?? [], [data]);

  // Filtered + sorted equipamentos
  const equipamentosFiltrados = useMemo(() => {
    if (!data) return [];
    let list = data.equipamentos;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.descricao.toLowerCase().includes(q) ||
          e.tag.toLowerCase().includes(q)
      );
    }

    if (localFilter !== "all") {
      list = list.filter((e) =>
        e.localInstalacao.toLowerCase().includes(localFilter.toLowerCase())
      );
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
  }, [data, search, localFilter, sortField, sortDir]);

  // KPI averages
  const kpis = useMemo(() => {
    const list = data?.equipamentos ?? [];
    if (list.length === 0) {
      return { mtbf: 0, mttr: 0, disp: 0, conf: 0 };
    }
    return {
      mtbf: list.reduce((s, e) => s + e.mtbf, 0) / list.length,
      mttr: list.reduce((s, e) => s + e.mttr, 0) / list.length,
      disp: list.reduce((s, e) => s + e.disponibilidade, 0) / list.length,
      conf: list.reduce((s, e) => s + e.confiabilidade, 0) / list.length,
    };
  }, [data]);

  // Chart data: top 10 worst MTBF
  const barChartData = useMemo(() => {
    if (!data) return [];
    return [...data.equipamentos]
      .sort((a, b) => a.mtbf - b.mtbf)
      .slice(0, 10)
      .map((e) => ({
        name: e.descricao.length > 22 ? e.descricao.slice(0, 22) + "…" : e.descricao,
        MTBF: e.mtbf,
        MTTR: e.mttr,
        tag: e.tag,
      }));
  }, [data]);

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

  // Custom tooltip for bar chart
  const CustomBarTooltip = ({ active, payload, label }: any) => {
    if (active && payload?.length) {
      return (
        <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow text-xs">
          <p className="font-semibold text-gray-700 mb-1">{label}</p>
          {payload.map((p: any) => (
            <p key={p.dataKey} style={{ color: p.color }}>
              {p.dataKey}: <span className="font-bold">{fmt1(p.value)}h</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const CustomLineTooltip = ({ active, payload, label }: any) => {
    if (active && payload?.length) {
      return (
        <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow text-xs">
          <p className="font-semibold text-gray-700 mb-1">{label}</p>
          {payload.map((p: any) => (
            <p key={p.dataKey} style={{ color: p.color }}>
              {p.dataKey}: <span className="font-bold">{fmt1(p.value)}h</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div>
      <PageHeader
        title="Dashboard PCM"
        subtitle="Planejamento e Controle de Manutenção — MTBF · MTTR · Confiabilidade"
        breadcrumbs={[
          { label: "Menu" },
          { label: "PCM" },
          { label: "Dashboard" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {data?.source === "mock" && (
              <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                <Database className="w-3 h-3" />
                Dados simulados (DB offline)
              </span>
            )}
            {data?.source === "db" && (
              <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 border border-green-200 rounded-md px-2 py-1">
                <Database className="w-3 h-3" />
                Engeman conectado
              </span>
            )}
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
              onClick={fetchData}
              disabled={loading}
              className="gap-1"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
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

          {locations.length > 0 && (
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Local</Label>
              <Select value={localFilter} onValueChange={setLocalFilter}>
                <SelectTrigger className="w-48 h-8 text-sm">
                  <SelectValue placeholder="Todos os locais" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os locais</SelectItem>
                  {locations.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs text-gray-500 mb-1 block">Equipamento</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input
                className="pl-8 h-8 text-sm"
                placeholder="Buscar equipamento..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
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
                            <span
                              className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                                eq.totalFalhas >= 5
                                  ? "bg-red-100 text-red-700"
                                  : eq.totalFalhas >= 3
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {eq.totalFalhas}
                            </span>
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

        {/* Charts */}
        {!loading && data && data.equipamentos.length > 0 && (
          <div className="grid grid-cols-2 gap-6">
            {/* Bar chart: Top 10 piores MTBF */}
            <Card className="border-gray-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-700">
                  MTBF por Equipamento
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    — 10 piores
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={barChartData}
                    layout="vertical"
                    margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${v}h`}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      axisLine={false}
                      tickLine={false}
                      width={130}
                    />
                    <Tooltip content={<CustomBarTooltip />} />
                    <Bar dataKey="MTBF" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="MTTR" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-4 mt-1 ml-2">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" />
                    MTBF (h)
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="w-3 h-3 rounded-sm bg-amber-400 inline-block" />
                    MTTR (h)
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Line chart: Falhas mensais + MTTR médio */}
            <Card className="border-gray-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-700">
                  Ocorrências Mensais
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    — falhas corretivas e MTTR médio
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart
                    data={data.tendencia}
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="falhas"
                      orientation="left"
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="mttr"
                      orientation="right"
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${v}h`}
                    />
                    <Tooltip content={<CustomLineTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                    <Line
                      yAxisId="falhas"
                      type="monotone"
                      dataKey="falhas"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#ef4444" }}
                      name="Falhas"
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      yAxisId="mttr"
                      type="monotone"
                      dataKey="mttrMedio"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#f59e0b" }}
                      name="MTTR Médio (h)"
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        )}

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
