"use client";

import { useState } from "react";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import { cn, formatDate } from "@/lib/utils";
import { useRelatorioCache } from "@/lib/use-relatorio-cache";
import { RefreshCw, AlertTriangle, CalendarClock } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import type { PlanosResponse } from "@/app/api/pcm/planos/route";

export default function PlanosPage() {
  useTabTitle("Planos de Manutenção");

  const [meses, setMeses] = useState(12);
  const { data, loading, refreshing, erro, recarregar } = useRelatorioCache<PlanosResponse>(`/api/pcm/planos?meses=${meses}`);

  const t = data?.totais;
  const planos = data?.planos ?? [];

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Planos de Manutenção"
        subtitle="Execução dos planos — O.S. geradas pelos planos do Engeman: concluídas, em aberto e atrasadas, por plano e por mês."
        breadcrumbs={[{ label: "PCM" }, { label: "Planos de Manutenção" }]}
      />

      <div className="px-8 pb-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          Período
          <select
            value={meses}
            onChange={(e) => setMeses(Number(e.target.value))}
            className="rounded-lg border border-border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={3}>Últimos 3 meses</option>
            <option value={6}>Últimos 6 meses</option>
            <option value={12}>Últimos 12 meses</option>
            <option value={24}>Últimos 24 meses</option>
          </select>
        </label>
        <button
          onClick={recarregar}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          <RefreshCw className={cn("w-4 h-4", (loading || refreshing) && "animate-spin")} />
          {refreshing ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Carregando dados do Engeman…
          </div>
        ) : erro ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
            <p className="text-sm text-muted-foreground">{erro}</p>
          </div>
        ) : data && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Kpi label="Planos com O.S." valor={String(t!.planosComOs)} cls="text-foreground" />
              <Kpi label="O.S. geradas" valor={String(t!.geradas)} cls="text-info" />
              <Kpi label="Concluídas" valor={String(t!.concluidas)} cls="text-success" />
              <Kpi label="Em aberto" valor={String(t!.abertas)} cls="text-warning" />
              <Kpi
                label="% execução"
                valor={t!.pctExecucao !== null ? `${t!.pctExecucao.toLocaleString("pt-BR")}%` : "—"}
                cls={t!.pctExecucao !== null && t!.pctExecucao >= 90 ? "text-success" : "text-warning"}
                rodape={t!.atrasadas > 0 ? `${t!.atrasadas} atrasada(s)` : undefined}
              />
            </div>

            {/* Gráfico geradas × concluídas */}
            <div className="bg-card rounded-xl border border-border shadow-sm p-4">
              <p className="text-sm font-medium text-foreground mb-3">O.S. de plano por mês — geradas × concluídas</p>
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={data.serie} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="geradas" name="Geradas" fill="#93c5fd" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="concluidas" name="Concluídas" fill="#16a34a" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tabela por plano */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="bg-muted text-xs text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Plano</th>
                    <th className="text-right font-medium px-2 py-2 w-20">Geradas</th>
                    <th className="text-right font-medium px-2 py-2 w-24">Concluídas</th>
                    <th className="text-right font-medium px-2 py-2 w-20">Abertas</th>
                    <th className="text-right font-medium px-2 py-2 w-24">Atrasadas</th>
                    <th className="text-left font-medium px-3 py-2 w-44">% Execução</th>
                    <th className="text-right font-medium px-2 py-2 w-28">Última concl.</th>
                    <th className="text-right font-medium px-3 py-2 w-32">Próx. programada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {planos.length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">Nenhuma O.S. gerada por plano no período.</td></tr>
                  )}
                  {planos.map((p) => (
                    <tr key={p.codPla} className={cn(p.atrasadas > 0 && "bg-danger/10")}>
                      <td className="px-3 py-2">
                        <div className="text-foreground">{p.descricao}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">Plano {p.tag}</div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-foreground">{p.geradas}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-success">
                        {p.concluidas}
                        {p.concluidasComAtraso > 0 && (
                          <div className="text-[11px] text-warning font-normal">{p.concluidasComAtraso} fora do prazo</div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-foreground">{p.abertas}</td>
                      <td className={cn("px-2 py-2 text-right tabular-nums font-semibold", p.atrasadas > 0 ? "text-danger" : "text-muted-foreground")}>
                        {p.atrasadas}
                      </td>
                      <td className="px-3 py-2">
                        {p.pctExecucao === null ? (
                          <span className="text-muted-foreground/60">—</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn("h-full rounded-full", p.pctExecucao >= 90 ? "bg-green-500" : p.pctExecucao >= 60 ? "bg-amber-400" : "bg-red-400")}
                                style={{ width: `${Math.min(p.pctExecucao, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs tabular-nums text-muted-foreground w-12 text-right">{p.pctExecucao.toLocaleString("pt-BR")}%</span>
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right text-xs text-muted-foreground">{p.ultimaConclusao ? formatDate(p.ultimaConclusao) : "—"}</td>
                      <td className="px-3 py-2 text-right text-xs">
                        {p.proximaProgramada ? (
                          <span className={cn("inline-flex items-center gap-1", new Date(p.proximaProgramada).getTime() < Date.now() ? "text-danger font-medium" : "text-muted-foreground")}>
                            <CalendarClock className="w-3 h-3" />
                            {formatDate(p.proximaProgramada)}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, valor, cls, rodape }: { label: string; valor: string; cls: string; rodape?: string }) {
  return (
    <div className="bg-card rounded-xl border border-border shadow-sm px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-bold", cls)}>{valor}</p>
      {rodape && <p className="text-[11px] text-red-500">{rodape}</p>}
    </div>
  );
}
