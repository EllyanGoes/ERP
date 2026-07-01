"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from "recharts";
import { formatBRL, formatDate } from "@/lib/utils";
import StatusBadge from "@/components/shared/StatusBadge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Loader2, TrendingDown, TrendingUp, ExternalLink } from "lucide-react";
import Link from "next/link";
import RelatorioAnual from "@/components/fluxo-caixa/RelatorioAnual";

type DayEntry = {
  data: string;
  receitas: number;
  despesas: number;
  recebido: number;
  pago: number;
  saldo: number;
};

type CRItem = {
  id: string;
  numero: string;
  descricao: string;
  valorOriginal: number;
  valorPago: number;
  status: string;
  cliente: { razaoSocial: string } | null;
  pedidoVenda: { numero: string } | null;
};

type CPItem = {
  id: string;
  numero: string;
  descricao: string;
  categoria: string;
  valorOriginal: number;
  valorPago: number;
  status: string;
  fornecedor: { razaoSocial: string } | null;
};

type DayDetail = {
  cr: CRItem[];
  cp: CPItem[];
  totalCR: number;
  totalCP: number;
  data: string;
};

export default function FluxoCaixaPage() {
  const [view, setView] = useState<"projecao" | "relatorio">("projecao");
  const [modo, setModo] = useState<"projetado" | "realizado">("projetado");
  const [data, setData] = useState<DayEntry[]>([]);
  const [periodo, setPeriodo] = useState<"7" | "30" | "90">("30");

  // Drill-down state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null);

  useEffect(() => {
    fetch(`/api/fluxo-caixa?modo=${modo}`)
      .then((r) => r.json())
      .then((json) => setData(json.data ?? []));
  }, [modo]);

  const realizado = modo === "realizado";

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - parseInt(periodo));
  const filtered = data.filter((d) => new Date(d.data) >= cutoff);

  const chartData = filtered.map((d) => ({
    data: d.data.slice(5), // "MM-DD"
    fullDate: d.data,      // "YYYY-MM-DD"
    Receitas: d.receitas,
    Despesas: d.despesas,
  }));

  const totalReceitas = filtered.reduce((s, d) => s + d.receitas, 0);
  const totalDespesas = filtered.reduce((s, d) => s + d.despesas, 0);
  const saldoFinal = filtered.length > 0 ? filtered[filtered.length - 1].saldo : 0;

  const handleBarClick = useCallback(async (entry: any) => {
    const fullDate: string = entry?.fullDate ?? entry?.activePayload?.[0]?.payload?.fullDate;
    if (!fullDate) return;
    setSelectedDay(fullDate);
    setSheetOpen(true);
    setDayDetail(null);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/fluxo-caixa/dia?data=${fullDate}&modo=${modo}`);
      const json = await res.json();
      setDayDetail(json);
    } catch {
      setDayDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, [modo]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload?.length) {
      return (
        <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-sm text-xs space-y-1">
          <p className="font-semibold text-foreground">{formatDate(payload[0]?.payload?.fullDate ?? label)}</p>
          {payload.map((p: any) => (
            <p key={p.name} style={{ color: p.color }} className="font-medium">
              {p.name}: {formatBRL(Number(p.value))}
            </p>
          ))}
          <p className="text-muted-foreground pt-0.5">Clique para detalhes</p>
        </div>
      );
    }
    return null;
  };

  const statusColor: Record<string, string> = {
    ABERTA: "text-info",
    PAGA: "text-success",
    VENCIDA: "text-danger",
    PARCIAL: "text-warning",
    CANCELADA: "text-muted-foreground",
  };

  return (
    <div>
      <PageHeader
        title="Fluxo de Caixa"
        breadcrumbs={[{ label: "Financeiro" }, { label: "Fluxo de Caixa" }]}
      />
      <div className="px-8 pb-8 space-y-6">
        {/* View tabs */}
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          <Button variant={view === "projecao" ? "default" : "ghost"} size="sm" onClick={() => setView("projecao")}>Projeção diária</Button>
          <Button variant={view === "relatorio" ? "default" : "ghost"} size="sm" onClick={() => setView("relatorio")}>Relatório anual</Button>
        </div>

        {view === "relatorio" ? (
          <RelatorioAnual />
        ) : (
        <>
        {/* Modo: projetado (por vencimento) vs realizado (pago/recebido de fato) */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
            <Button variant={!realizado ? "default" : "ghost"} size="sm" onClick={() => setModo("projetado")}>Por vencimento</Button>
            <Button variant={realizado ? "default" : "ghost"} size="sm" onClick={() => setModo("realizado")}>Realizado</Button>
          </div>
          <span className="text-xs text-muted-foreground">
            {realizado ? "O que de fato foi pago e recebido (por data do pagamento)." : "Projeção pelo vencimento das contas a pagar/receber."}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {(["7", "30", "90"] as const).map((p) => (
              <Button
                key={p}
                variant={periodo === p ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriodo(p)}
              >
                {p === "7" ? "7 dias" : p === "30" ? "30 dias" : "90 dias"}
              </Button>
            ))}
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-success/10 rounded-xl p-4">
            <p className="text-sm text-success font-medium">{realizado ? "Recebido" : "Receitas Projetadas"}</p>
            <p className="text-2xl font-bold text-success mt-1">{formatBRL(totalReceitas)}</p>
          </div>
          <div className="bg-danger/10 rounded-xl p-4">
            <p className="text-sm text-danger font-medium">{realizado ? "Pago" : "Despesas Projetadas"}</p>
            <p className="text-2xl font-bold text-danger mt-1">{formatBRL(totalDespesas)}</p>
          </div>
          <div className={`rounded-xl p-4 ${saldoFinal >= 0 ? "bg-info/10" : "bg-warning/10"}`}>
            <p className={`text-sm font-medium ${saldoFinal >= 0 ? "text-info" : "text-warning"}`}>
              Saldo Acumulado
            </p>
            <p className={`text-2xl font-bold mt-1 ${saldoFinal >= 0 ? "text-info" : "text-warning"}`}>
              {formatBRL(saldoFinal)}
            </p>
          </div>
        </div>

        {/* Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {realizado ? "Recebido vs Pago (realizado)" : "Receitas vs Despesas por Vencimento"}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                — clique em uma barra para detalhar o dia
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={chartData}
                margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                style={{ cursor: "pointer" }}
                onClick={handleBarClick}
              >
                <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f8fafc" }} />
                <Legend />
                <Bar
                  dataKey="Receitas"
                  radius={[4, 4, 0, 0]}
                  onClick={(entry) => handleBarClick(entry)}
                >
                  {chartData.map((entry) => (
                    <Cell
                      key={entry.fullDate}
                      fill={selectedDay === entry.fullDate ? "#15803d" : "#22c55e"}
                    />
                  ))}
                </Bar>
                <Bar
                  dataKey="Despesas"
                  radius={[4, 4, 0, 0]}
                  onClick={(entry) => handleBarClick(entry)}
                >
                  {chartData.map((entry) => (
                    <Cell
                      key={entry.fullDate}
                      fill={selectedDay === entry.fullDate ? "#b91c1c" : "#ef4444"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Daily table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detalhamento Diário</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground uppercase">
                    <th className="text-left pb-2 py-2">Data</th>
                    <th className="text-right pb-2 py-2">Receitas</th>
                    <th className="text-right pb-2 py-2">Despesas</th>
                    <th className="text-right pb-2 py-2">Saldo Acumulado</th>
                    <th className="pb-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => (
                    <tr
                      key={d.data}
                      className={`border-b border-gray-50 hover:bg-muted cursor-pointer ${
                        selectedDay === d.data ? "bg-info/10" : ""
                      }`}
                      onClick={() => handleBarClick({ fullDate: d.data })}
                    >
                      <td className="py-2.5">{formatDate(d.data)}</td>
                      <td className="py-2.5 text-right text-success">{formatBRL(d.receitas)}</td>
                      <td className="py-2.5 text-right text-red-500">{formatBRL(d.despesas)}</td>
                      <td className={`py-2.5 text-right font-semibold ${d.saldo >= 0 ? "text-info" : "text-orange-600"}`}>
                        {formatBRL(d.saldo)}
                      </td>
                      <td className="py-2.5 text-right">
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/60 hover:text-blue-500" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        </>
        )}
      </div>

      {/* Drill-down Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {selectedDay ? formatDate(selectedDay) : ""}
            </SheetTitle>
            <SheetDescription>
              {realizado ? "Recebimentos e pagamentos realizados neste dia" : "Contas a receber e a pagar com vencimento neste dia"}
            </SheetDescription>
          </SheetHeader>

          <div className="p-6 space-y-6">
            {loadingDetail && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                <span className="ml-2 text-sm text-muted-foreground">Carregando...</span>
              </div>
            )}

            {!loadingDetail && dayDetail && (
              <>
                {/* Totals row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-success/10 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <TrendingUp className="w-3.5 h-3.5 text-success" />
                      <span className="text-xs text-success font-medium">{realizado ? "Recebido" : "A Receber"}</span>
                    </div>
                    <p className="text-lg font-bold text-success">{formatBRL(dayDetail.totalCR)}</p>
                  </div>
                  <div className="bg-danger/10 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <TrendingDown className="w-3.5 h-3.5 text-danger" />
                      <span className="text-xs text-danger font-medium">{realizado ? "Pago" : "A Pagar"}</span>
                    </div>
                    <p className="text-lg font-bold text-danger">{formatBRL(dayDetail.totalCP)}</p>
                  </div>
                </div>

                {/* Contas a Receber */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {realizado ? "Recebimentos" : "Contas a Receber"} ({dayDetail.cr.length})
                  </p>
                  {dayDetail.cr.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-3 text-center">Nenhuma conta a receber</p>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      {dayDetail.cr.map((c, i) => (
                        <div
                          key={c.id}
                          className={`flex items-start justify-between p-3 gap-3 ${
                            i < dayDetail.cr.length - 1 ? "border-b" : ""
                          } hover:bg-muted`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground">{c.numero}</span>
                              <StatusBadge status={c.status} />
                            </div>
                            <p className="text-sm font-medium text-foreground mt-0.5 truncate">
                              {c.cliente?.razaoSocial ?? "—"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{c.descricao}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold text-success">
                              {formatBRL(Number(c.valorOriginal))}
                            </p>
                            {c.pedidoVenda && (
                              <p className="text-xs text-muted-foreground font-mono">{c.pedidoVenda.numero}</p>
                            )}
                          </div>
                          <Link
                            href={`/contas-receber/${c.id}`}
                            className="text-blue-400 hover:text-info shrink-0 mt-0.5"
                            onClick={() => setSheetOpen(false)}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Contas a Pagar */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {realizado ? "Pagamentos" : "Contas a Pagar"} ({dayDetail.cp.length})
                  </p>
                  {dayDetail.cp.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-3 text-center">Nenhuma conta a pagar</p>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      {dayDetail.cp.map((c, i) => (
                        <div
                          key={c.id}
                          className={`flex items-start justify-between p-3 gap-3 ${
                            i < dayDetail.cp.length - 1 ? "border-b" : ""
                          } hover:bg-muted`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground">{c.numero}</span>
                              <StatusBadge status={c.status} />
                            </div>
                            <p className="text-sm font-medium text-foreground mt-0.5 truncate">
                              {c.descricao}
                            </p>
                            <p className="text-xs text-muted-foreground">{c.categoria}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold text-danger">
                              {formatBRL(Number(c.valorOriginal))}
                            </p>
                            {c.fornecedor && (
                              <p className="text-xs text-muted-foreground truncate max-w-[100px]">{c.fornecedor.razaoSocial}</p>
                            )}
                          </div>
                          <Link
                            href={`/contas-pagar/${c.id}`}
                            className="text-blue-400 hover:text-info shrink-0 mt-0.5"
                            onClick={() => setSheetOpen(false)}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Net position */}
                <div className={`rounded-xl p-4 ${dayDetail.totalCR - dayDetail.totalCP >= 0 ? "bg-info/10" : "bg-warning/10"}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium ${dayDetail.totalCR - dayDetail.totalCP >= 0 ? "text-info" : "text-warning"}`}>
                      Saldo do dia
                    </span>
                    <span className={`text-lg font-bold ${dayDetail.totalCR - dayDetail.totalCP >= 0 ? "text-info" : "text-warning"}`}>
                      {formatBRL(dayDetail.totalCR - dayDetail.totalCP)}
                    </span>
                  </div>
                </div>
              </>
            )}

            {!loadingDetail && !dayDetail && (
              <p className="text-center text-sm text-muted-foreground py-12">
                Erro ao carregar detalhes. Tente novamente.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
