"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import CriticidadeBadge from "@/components/pcm/CriticidadeBadge";
import { cn } from "@/lib/utils";
import { RefreshCw, AlertTriangle, ClipboardCheck } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { MtbfMttrResponse } from "@/app/api/pcm/ativo-saude/mtbf-mttr/route";

const numFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const fmtH = (n: number | null) => (n === null || n === undefined ? "—" : `${numFmt.format(n)} h`);
type Filtro = "all" | "A" | "B" | "C";

function compStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function AtivoSaudePage() {
  useTabTitle("MTBF / MTTR");

  const now = new Date();
  const [de, setDe] = useState(compStr(new Date(now.getFullYear(), now.getMonth() - 11, 1)));
  const [ate, setAte] = useState(compStr(now));
  const [filtro, setFiltro] = useState<Filtro>("all");
  const [data, setData] = useState<MtbfMttrResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const params = new URLSearchParams({ de, ate });
      if (filtro !== "all") params.set("criticidade", filtro);
      const res = await fetch(`/api/pcm/ativo-saude/mtbf-mttr?${params.toString()}`);
      if (!res.ok) {
        setErro("Não foi possível carregar o relatório.");
        setData(null);
        return;
      }
      setData(await res.json());
    } catch {
      setErro("Erro de conexão ao carregar o relatório.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [de, ate, filtro]);

  useEffect(() => {
    load();
  }, [load]);

  const serie = data?.serie ?? [];
  const porAtivo = data?.porAtivo ?? [];
  const totais = data?.totais;
  const vazio = !loading && !erro && serie.length === 0;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="MTBF / MTTR"
        subtitle="Ativo Saúde — confiabilidade com base nos meses já fechados. MTBF = (funcionamento − parada não planejada) / falhas; MTTR = parada / falhas."
        breadcrumbs={[{ label: "PCM" }, { label: "Ativo Saúde" }, { label: "MTBF / MTTR" }]}
      />

      {/* Toolbar */}
      <div className="px-8 pb-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          De
          <input
            type="month"
            value={de}
            max={ate}
            onChange={(e) => setDe(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          até
          <input
            type="month"
            value={ate}
            min={de}
            onChange={(e) => setAte(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <div className="flex items-center gap-1.5">
          {(["all", "A", "B", "C"] as Filtro[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                filtro === f ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50",
              )}
            >
              {f === "all" ? "Todos" : <>Criticidade {f}</>}
            </button>
          ))}
        </div>
        <Link
          href="/pcm/ativo-saude/fechamento"
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          <ClipboardCheck className="w-4 h-4" /> Fechamento mensal
        </Link>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto px-8 pb-8 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 gap-2 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Carregando…
          </div>
        ) : erro ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mb-3">
              <AlertTriangle className="w-7 h-7 text-amber-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">{erro}</p>
            <button
              type="button"
              onClick={load}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <RefreshCw className="w-4 h-4" /> Tentar novamente
            </button>
          </div>
        ) : vazio ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <ClipboardCheck className="w-7 h-7 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-700">Nenhum mês fechado no período</p>
            <p className="text-xs text-gray-400 mt-1 mb-3">
              O relatório só considera meses validados. Faça o fechamento mensal primeiro.
            </p>
            <Link
              href="/pcm/ativo-saude/fechamento"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <ClipboardCheck className="w-4 h-4" /> Ir para o fechamento
            </Link>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="MTBF médio" value={fmtH(totais?.mtbf ?? null)} cls="text-blue-700" />
              <Kpi label="MTTR médio" value={fmtH(totais?.mttr ?? null)} cls="text-gray-800" />
              <Kpi label="Falhas no período" value={String(totais?.falhas ?? 0)} cls="text-gray-800" />
              <Kpi label="Parada não planejada" value={fmtH(totais?.horasParada ?? null)} cls="text-gray-800" />
            </div>

            {/* Gráfico */}
            <div className="bg-white rounded-xl border border-gray-300 shadow-sm p-4">
              <p className="text-sm font-medium text-gray-700 mb-3">MTBF e MTTR por mês (horas)</p>
              <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                  <LineChart data={serie} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <Tooltip formatter={(v) => `${numFmt.format(Number(v))} h`} />
                    <Legend />
                    <Line type="monotone" dataKey="mtbf" name="MTBF" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="mttr" name="MTTR" stroke="#6b7280" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tabela por ativo */}
            <div className="bg-white rounded-xl border border-gray-300 shadow-sm overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Ativo</th>
                    <th className="text-center font-medium px-2 py-2 w-12">Crit.</th>
                    <th className="text-right font-medium px-2 py-2 w-20">Falhas</th>
                    <th className="text-right font-medium px-2 py-2 w-28">Parada</th>
                    <th className="text-right font-medium px-2 py-2 w-32">Funcionamento</th>
                    <th className="text-right font-medium px-2 py-2 w-24">MTBF</th>
                    <th className="text-right font-medium px-2 py-2 w-24">MTTR</th>
                    <th className="text-right font-medium px-3 py-2 w-20">Meses</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {porAtivo.map((a) => (
                    <tr key={a.codApl}>
                      <td className="px-3 py-2">
                        <div className="text-gray-800 truncate max-w-[280px]" title={a.descricao}>{a.descricao}</div>
                        <div className="text-[11px] text-gray-400 font-mono">{a.tag}</div>
                      </td>
                      <td className="px-2 py-2 text-center">
                        {a.criticidade ? <CriticidadeBadge value={a.criticidade} /> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-gray-700">{a.falhas}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-gray-600">{fmtH(a.horasParada)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-gray-600">{fmtH(a.horasFuncionamento)}</td>
                      <td className="px-2 py-2 text-right tabular-nums font-semibold text-blue-700">{fmtH(a.mtbf)}</td>
                      <td className="px-2 py-2 text-right tabular-nums font-semibold text-gray-700">{fmtH(a.mttr)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-400">{a.meses}</td>
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

function Kpi({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-300 shadow-sm px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={cn("text-xl font-bold mt-0.5 tabular-nums", cls)}>{value}</p>
    </div>
  );
}
