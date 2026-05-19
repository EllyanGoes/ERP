"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  RefreshCw,
  Database,
  Cpu,
  Tag,
  MapPin,
  AlertTriangle,
  Timer,
  Activity,
  TrendingUp,
  Loader2,
  CalendarCheck,
  CalendarX,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  FileBarChart2,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { FMEAResponse, FalhaRegistro } from "@/app/api/pcm/fmea/[codapl]/route";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtH(h: number): string {
  if (h <= 0) return "0h";
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const r = Math.round(h % 24);
    return r > 0 ? `${d}d ${r}h` : `${d}d`;
  }
  return `${h.toFixed(1)}h`;
}

const PRIORIDADE_COLOR: Record<string, string> = {
  ALTA:  "bg-red-100 text-red-700 border-red-200",
  MÉDIA: "bg-amber-100 text-amber-700 border-amber-200",
  BAIXA: "bg-green-100 text-green-700 border-green-200",
};

const STATUS_COLOR: Record<string, string> = {
  A: "bg-blue-100 text-blue-700",
  F: "bg-green-100 text-green-700",
  C: "bg-gray-100 text-gray-500",
};
const STATUS_LABEL: Record<string, string> = {
  A: "Em Aberto",
  F: "Concluída",
  C: "Cancelada",
};

type SortKey = "datent" | "horasParada" | "prioridade" | "tipo";

// ── KPI Card ──────────────────────────────────────────────────────────────────
function Kpi({ label, value, sub, color, bg, icon: Icon }: {
  label: string; value: string; sub?: string; color: string; bg: string; icon: React.ElementType;
}) {
  return (
    <div className={`rounded-xl p-4 ${bg} border border-gray-100`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
          <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg bg-white/60`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
      </div>
    </div>
  );
}

// ── Sort icon ─────────────────────────────────────────────────────────────────
function SortIcon({ field, sortKey, sortDir }: { field: string; sortKey: string; sortDir: "asc" | "desc" }) {
  if (sortKey !== field) return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
  return sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function FMEAPage() {
  const { codapl } = useParams<{ codapl: string }>();
  const searchParams = useSearchParams();

  const [dias, setDias]       = useState(() => parseInt(searchParams.get("dias") ?? "365", 10) || 365);
  const [data, setData]       = useState<FMEAResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [sortKey, setSortKey]   = useState<SortKey>("datent");
  const [sortDir, setSortDir]   = useState<"asc" | "desc">("desc");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/pcm/fmea/${codapl}?dias=${dias}`);
      const json = await res.json();
      setData(json as FMEAResponse);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [codapl, dias]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Sorted failures ────────────────────────────────────────────────────────
  const sorted: FalhaRegistro[] = data
    ? [...data.falhas].sort((a, b) => {
        let cmp = 0;
        if (sortKey === "datent")      cmp = a.datent.localeCompare(b.datent);
        if (sortKey === "horasParada") cmp = a.horasParada - b.horasParada;
        if (sortKey === "tipo")        cmp = (a.tipo ?? "").localeCompare(b.tipo ?? "");
        if (sortKey === "prioridade") {
          const order = { ALTA: 0, MÉDIA: 1, BAIXA: 2 };
          const ap = a.prioridade ? (order[a.prioridade as keyof typeof order] ?? 3) : 3;
          const bp = b.prioridade ? (order[b.prioridade as keyof typeof order] ?? 3) : 3;
          cmp = ap - bp;
        }
        return sortDir === "asc" ? cmp : -cmp;
      })
    : [];

  function handleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  }

  // ── Falhas por tipo (bar chart) ────────────────────────────────────────────
  const tipoChart = data
    ? Object.entries(
        data.falhas.reduce<Record<string, number>>((acc, f) => {
          acc[f.tipo] = (acc[f.tipo] ?? 0) + 1;
          return acc;
        }, {})
      )
        .sort(([, a], [, b]) => b - a)
        .map(([name, count]) => ({ name, count }))
    : [];

  return (
    <div>
      <PageHeader
        title={data ? `FMEA — ${data.equipamento}` : "FMEA"}
        subtitle={data ? `${data.tag} · ${data.local} · Últimos ${data.periodoMeses} meses` : "Análise de Modos de Falha e Efeitos"}
        breadcrumbs={[
          { label: "PCM" },
          { label: "Resultados", href: "/pcm/dashboard" },
          { label: data ? data.equipamento : "FMEA" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {data && (
              <div className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border",
                data.source === "db"
                  ? "bg-green-50 border-green-200 text-green-700"
                  : "bg-amber-50 border-amber-200 text-amber-700",
              )}>
                <Database className="w-3.5 h-3.5" />
                <span className={cn("w-2 h-2 rounded-full",
                  data.source === "db"
                    ? "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.6)]"
                    : "bg-amber-400",
                )} />
                {data.source === "db" ? "Engeman online" : "Engeman offline"}
              </div>
            )}

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

            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="gap-1.5">
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
              Atualizar
            </Button>

            <Link href="/pcm/dashboard">
              <Button variant="ghost" size="sm" className="gap-1.5">
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </Button>
            </Link>
          </div>
        }
      />

      <div className="px-8 pb-10 space-y-6">

        {loading && !data && (
          <div className="flex items-center justify-center py-24 text-gray-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Buscando histórico de falhas…</span>
          </div>
        )}

        {data && (
          <>
            {/* ── Equipamento info ────────────────────────────────────────── */}
            <Card className="border-gray-100">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-6 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <Cpu className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Ativo</p>
                      <p className="text-sm font-semibold text-gray-900">{data.equipamento}</p>
                    </div>
                  </div>
                  {data.tag && (
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-gray-50 rounded-lg">
                        <Tag className="w-5 h-5 text-gray-500" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">TAG</p>
                        <p className="text-sm font-semibold text-gray-700 font-mono">{data.tag}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-gray-50 rounded-lg">
                      <MapPin className="w-5 h-5 text-gray-500" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Local</p>
                      <p className="text-sm font-semibold text-gray-700">{data.local}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-auto">
                    <FileBarChart2 className="w-4 h-4 text-gray-400" />
                    <p className="text-xs text-gray-400">
                      Análise de Modos de Falha e Efeitos — últimos {data.periodoMeses} {data.periodoMeses === 1 ? "mês" : "meses"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── KPIs ────────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <Kpi
                label="Total Falhas"
                value={String(data.totalFalhas)}
                sub="ocorrências corretivas"
                color={data.totalFalhas >= 10 ? "text-red-600" : data.totalFalhas >= 5 ? "text-amber-600" : "text-gray-700"}
                bg={data.totalFalhas >= 10 ? "bg-red-50" : data.totalFalhas >= 5 ? "bg-amber-50" : "bg-gray-50"}
                icon={AlertTriangle}
              />
              <Kpi
                label="Horas Paradas"
                value={fmtH(data.totalHorasParada)}
                sub="tempo total de reparo"
                color="text-orange-600"
                bg="bg-orange-50"
                icon={Timer}
              />
              <Kpi
                label="MTBF"
                value={fmtH(data.mtbf)}
                sub="tempo médio entre falhas"
                color="text-teal-600"
                bg="bg-teal-50"
                icon={Activity}
              />
              <Kpi
                label="MTTR"
                value={fmtH(data.mttr)}
                sub="tempo médio de reparo"
                color="text-amber-600"
                bg="bg-amber-50"
                icon={Timer}
              />
              <Kpi
                label="Disponibilidade"
                value={`${data.disponibilidade.toFixed(1)}%`}
                sub="tempo operacional"
                color={data.disponibilidade >= 95 ? "text-green-600" : data.disponibilidade >= 85 ? "text-amber-600" : "text-red-600"}
                bg={data.disponibilidade >= 95 ? "bg-green-50" : data.disponibilidade >= 85 ? "bg-amber-50" : "bg-red-50"}
                icon={TrendingUp}
              />
            </div>

            {/* ── Falhas por tipo (bar chart) ─────────────────────────────── */}
            {tipoChart.length > 0 && (
              <Card className="border-gray-100">
                <CardContent className="pt-4 pb-2">
                  <p className="text-sm font-semibold text-gray-700 mb-3">Frequência por Tipo de Manutenção</p>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={tipoChart} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                        width={160}
                      />
                      <Tooltip
                        formatter={(v) => [`${v} falha(s)`, "Qtd"]}
                        contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }}
                      />
                      <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} name="Falhas" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* ── Failure list ─────────────────────────────────────────────── */}
            <Card className="border-gray-100">
              <CardContent className="p-0">
                {/* Table header */}
                <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700">
                    Registro de Falhas
                    <span className="ml-2 text-xs font-normal text-gray-400">{data.falhas.length} ocorrências</span>
                  </p>
                </div>

                {data.falhas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <Activity className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm">Nenhuma falha corretiva registrada no período.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-t border-gray-100 bg-gray-50 text-xs text-gray-400 uppercase">
                          <th className="text-left px-5 py-2.5">
                            <button className="flex items-center gap-1 hover:text-gray-600" onClick={() => handleSort("datent")}>
                              Data Abertura <SortIcon field="datent" sortKey={sortKey} sortDir={sortDir} />
                            </button>
                          </th>
                          <th className="text-left px-4 py-2.5">OS # / Descrição</th>
                          <th className="text-left px-4 py-2.5 hidden md:table-cell">
                            <button className="flex items-center gap-1 hover:text-gray-600" onClick={() => handleSort("tipo")}>
                              Tipo <SortIcon field="tipo" sortKey={sortKey} sortDir={sortDir} />
                            </button>
                          </th>
                          <th className="text-center px-4 py-2.5">
                            <button className="flex items-center gap-1 hover:text-gray-600 mx-auto" onClick={() => handleSort("prioridade")}>
                              Prioridade <SortIcon field="prioridade" sortKey={sortKey} sortDir={sortDir} />
                            </button>
                          </th>
                          <th className="text-right px-4 py-2.5">
                            <button className="flex items-center gap-1 hover:text-gray-600 ml-auto" onClick={() => handleSort("horasParada")}>
                              Horas Parada <SortIcon field="horasParada" sortKey={sortKey} sortDir={sortDir} />
                            </button>
                          </th>
                          <th className="text-center px-4 py-2.5">Status</th>
                          <th className="text-left px-4 py-2.5 hidden lg:table-cell">Conclusão</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map((f, i) => (
                          <tr key={f.codord} className={`border-b border-gray-50 hover:bg-gray-50/70 transition-colors ${i % 2 === 1 ? "bg-gray-50/30" : ""}`}>
                            <td className="px-5 py-3">
                              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                                <CalendarCheck className="w-3 h-3 text-gray-400" />
                                {f.datent}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-800 text-xs truncate max-w-[220px]">{f.descricao}</p>
                              <p className="text-[11px] text-gray-400 font-mono mt-0.5">#{f.codord}</p>
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
                                {f.tipo}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {f.prioridade ? (
                                <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border",
                                  PRIORIDADE_COLOR[f.prioridade] ?? "bg-gray-100 text-gray-600 border-gray-200"
                                )}>
                                  {f.prioridade}
                                </span>
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={`font-bold text-sm ${f.horasParada >= 8 ? "text-red-600" : f.horasParada >= 4 ? "text-amber-600" : "text-gray-700"}`}>
                                {fmtH(f.horasParada)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium",
                                STATUS_COLOR[f.statord] ?? "bg-gray-100 text-gray-500"
                              )}>
                                {STATUS_LABEL[f.statord] ?? f.statord}
                              </span>
                            </td>
                            <td className="px-4 py-3 hidden lg:table-cell">
                              {f.datafim ? (
                                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                                  <CalendarX className="w-3 h-3 text-gray-400" />
                                  {f.datafim}
                                </span>
                              ) : (
                                <span className="text-gray-300 text-xs">Em aberto</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Footer */}
            <p className="text-xs text-gray-400 text-right">
              Atualizado em {new Date(data.generatedAt).toLocaleString("pt-BR")} ·{" "}
              Fonte: {data.source === "db" ? "Engeman CMMS" : "Dados simulados"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
