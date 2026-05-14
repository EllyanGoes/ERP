"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { formatBRL, formatDate } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { TrendingUp, Loader2, ExternalLink } from "lucide-react";
import Link from "next/link";
import StatusBadge from "@/components/shared/StatusBadge";

interface MonthlyData {
  mes: string;
  receita: number;
  key: string; // "YYYY-MM"
}

interface ContaDetail {
  id: string;
  numero: string;
  descricao: string;
  valorPago: number;
  dataPagamento: string;
  pedidoVendaId: string | null;
  cliente: { razaoSocial: string; nomeFantasia: string };
}

interface DashboardChartsProps {
  data: MonthlyData[];
}

const MESES_FULL: Record<string, string> = {
  Jan: "Janeiro", Fev: "Fevereiro", Mar: "Março", Abr: "Abril",
  Mai: "Maio", Jun: "Junho", Jul: "Julho", Ago: "Agosto",
  Set: "Setembro", Out: "Outubro", Nov: "Novembro", Dez: "Dezembro",
};

export default function DashboardCharts({ data }: DashboardChartsProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<MonthlyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<{ contas: ContaDetail[]; total: number } | null>(null);

  const handleBarClick = useCallback(async (entry: MonthlyData) => {
    setSelected(entry);
    setOpen(true);
    setDetail(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/receita?mes=${entry.key}`);
      const json = await res.json();
      setDetail({ contas: json.contas ?? [], total: json.total ?? 0 });
    } catch {
      setDetail({ contas: [], total: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload?.length) {
      return (
        <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm text-xs">
          <p className="font-semibold text-gray-700 mb-1">{MESES_FULL[label] ?? label}</p>
          <p className="text-blue-600 font-bold">{formatBRL(Number(payload[0].value))}</p>
          <p className="text-gray-400 mt-0.5">Clique para detalhes</p>
        </div>
      );
    }
    return null;
  };

  return (
    <>
      <Card className="border-gray-100">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-700">
            Receita dos Últimos 12 Meses
            <span className="ml-2 text-xs font-normal text-gray-400">— clique em uma barra para detalhar</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={data}
              margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
              style={{ cursor: "pointer" }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="mes"
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) =>
                  v >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : `R$ ${v}`
                }
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f1f5f9" }} />
              <Bar
                dataKey="receita"
                radius={[4, 4, 0, 0]}
                name="Receita"
                onClick={(entry) => handleBarClick(entry as unknown as MonthlyData)}
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.key}
                    fill={selected?.key === entry.key ? "#1d4ed8" : "#3b82f6"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              Receita — {selected ? `${MESES_FULL[selected.mes] ?? selected.mes} ${selected.key.split("-")[0]}` : ""}
            </SheetTitle>
            <SheetDescription>
              Contas a receber pagas neste mês
            </SheetDescription>
          </SheetHeader>

          <div className="p-6">
            {loading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                <span className="ml-2 text-sm text-gray-500">Carregando...</span>
              </div>
            )}

            {!loading && detail && (
              <>
                {/* Summary */}
                <div className="bg-blue-50 rounded-xl px-4 py-3 mb-5 flex items-center justify-between">
                  <span className="text-sm text-blue-700 font-medium">Total recebido no mês</span>
                  <span className="text-xl font-bold text-blue-800">{formatBRL(detail.total)}</span>
                </div>

                {detail.contas.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 text-sm">
                    Nenhum recebimento registrado neste mês.
                  </div>
                ) : (
                  <div className="space-y-0 border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-xs text-gray-400 uppercase border-b">
                          <th className="text-left px-4 py-2.5">Nº / Cliente</th>
                          <th className="text-left px-4 py-2.5">Descrição</th>
                          <th className="text-right px-4 py-2.5">Recebido</th>
                          <th className="text-right px-4 py-2.5">Data</th>
                          <th className="px-2 py-2.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {detail.contas.map((c) => (
                          <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-mono text-xs text-gray-500">{c.numero}</p>
                              <p className="font-medium text-gray-800 text-xs mt-0.5 truncate max-w-[140px]">
                                {c.cliente?.nomeFantasia || c.cliente?.razaoSocial}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600 max-w-[160px]">
                              <p className="truncate">{c.descricao || "—"}</p>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-green-700 text-sm">
                              {formatBRL(Number(c.valorPago))}
                            </td>
                            <td className="px-4 py-3 text-right text-xs text-gray-500">
                              {c.dataPagamento ? formatDate(c.dataPagamento) : "—"}
                            </td>
                            <td className="px-2 py-3 text-right">
                              <Link
                                href={`/contas-receber/${c.id}`}
                                className="text-blue-500 hover:text-blue-700 transition-colors"
                                onClick={() => setOpen(false)}
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Breakdown by client */}
                {detail.contas.length > 1 && (() => {
                  const byClient = detail.contas.reduce<Record<string, number>>((acc, c) => {
                    const name = c.cliente?.nomeFantasia || c.cliente?.razaoSocial || "Outros";
                    acc[name] = (acc[name] ?? 0) + Number(c.valorPago);
                    return acc;
                  }, {});
                  const sorted = Object.entries(byClient).sort(([, a], [, b]) => b - a);

                  return (
                    <div className="mt-6">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        Por cliente
                      </p>
                      <div className="space-y-2">
                        {sorted.map(([name, val]) => {
                          const pct = detail.total > 0 ? (val / detail.total) * 100 : 0;
                          return (
                            <div key={name}>
                              <div className="flex items-center justify-between text-xs mb-0.5">
                                <span className="text-gray-700 font-medium truncate max-w-[200px]">{name}</span>
                                <span className="text-gray-500 ml-2 shrink-0">
                                  {formatBRL(val)} <span className="text-gray-300">·</span> {pct.toFixed(0)}%
                                </span>
                              </div>
                              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-500 rounded-full transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
