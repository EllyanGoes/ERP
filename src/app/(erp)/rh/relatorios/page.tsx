"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { formatBRL, cn } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";
import { Loader2, CalendarDays, FileText } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

// Paleta validada (CVD/contraste, temas claro e escuro): azul + âmbar.
const COR_DIARIA = "#3b82f6";
const COR_BRUTO = "#3b82f6";
const COR_LIQUIDO = "#d97706";

type DiariaFolhaRow = { id: string; data: string; turno: string; status: string; total: number | string };
type FolhaRow = { id: string; competencia: string; status: string; totalBruto: string; totalLiquido: string };

const brl = (v: number) => formatBRL(v);
const diaLabel = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};
const diaLongo = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return `${d.toLocaleDateString("pt-BR")} - ${d.toLocaleDateString("pt-BR", { weekday: "long" })}`;
};
const compLabel = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCFullYear()).slice(2)}`;
};

export default function RelatoriosPessoalPage() {
  useTabTitle("Relatórios — Folha e Diárias");
  const [loading, setLoading] = useState(true);
  const [diarias, setDiarias] = useState<DiariaFolhaRow[]>([]);
  const [folhas, setFolhas] = useState<FolhaRow[]>([]);
  const [periodoDias, setPeriodoDias] = useState(30);

  useEffect(() => {
    Promise.all([
      fetch("/api/rh/diaristas").then((r) => r.json()),
      fetch("/api/rh/folhas").then((r) => r.json()),
    ])
      .then(([jd, jf]) => {
        setDiarias(Array.isArray(jd.data) ? jd.data : []);
        setFolhas(Array.isArray(jf.data) ? jf.data : []);
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Diárias: total por dia no período escolhido ────────────────────────────
  const dadosDiarias = useMemo(() => {
    const corte = new Date();
    corte.setDate(corte.getDate() - periodoDias);
    const porDia = new Map<string, number>();
    for (const f of diarias) {
      const dia = f.data.slice(0, 10);
      if (new Date(`${dia}T12:00:00`) < corte) continue;
      porDia.set(dia, (porDia.get(dia) ?? 0) + Number(f.total));
    }
    return Array.from(porDia.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dia, total]) => ({ dia, label: diaLabel(dia), total: Math.round(total * 100) / 100 }));
  }, [diarias, periodoDias]);

  const totalDiarias = dadosDiarias.reduce((s, d) => s + d.total, 0);
  const mediaDia = dadosDiarias.length ? totalDiarias / dadosDiarias.length : 0;

  // ── Folha de pagamento: bruto × líquido por competência (últimos 12 meses) ─
  const dadosFolha = useMemo(
    () =>
      [...folhas]
        .sort((a, b) => a.competencia.localeCompare(b.competencia))
        .slice(-12)
        .map((f) => ({
          label: compLabel(f.competencia),
          Bruto: Math.round(parseFloat(f.totalBruto) * 100) / 100,
          Líquido: Math.round(parseFloat(f.totalLiquido) * 100) / 100,
          status: f.status,
        })),
    [folhas],
  );
  const ultimaFolha = dadosFolha[dadosFolha.length - 1];

  const tickStyle = { fontSize: 11, fill: "#94a3b8" };
  const moedaCompacta = (v: number) =>
    v >= 10000 ? v.toLocaleString("pt-BR", { notation: "compact" }) : v.toLocaleString("pt-BR");

  return (
    <div>
      <PageHeader
        title="Relatórios — Folha e Diárias"
        breadcrumbs={[{ label: "Gestão de Pessoas" }, { label: "Relatórios" }]}
      />
      <div className="px-8 pb-10 space-y-6">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* ── Diárias por dia ─────────────────────────────────────────── */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-info" />
                  <h2 className="font-semibold text-foreground">Diárias por dia</h2>
                </div>
                <select
                  value={periodoDias}
                  onChange={(e) => setPeriodoDias(Number(e.target.value))}
                  className="h-8 rounded-lg border border-border bg-card px-2 text-xs"
                >
                  <option value={30}>Últimos 30 dias</option>
                  <option value={60}>Últimos 60 dias</option>
                  <option value={90}>Últimos 90 dias</option>
                </select>
                <div className="ml-auto flex items-center gap-5 text-right">
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total no período</p>
                    <p className="text-lg font-bold tabular-nums">{brl(totalDiarias)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Média por dia</p>
                    <p className="text-lg font-bold tabular-nums">{brl(mediaDia)}</p>
                  </div>
                </div>
              </div>

              {dadosDiarias.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">Nenhum lançamento de diárias no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dadosDiarias} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#94a3b8" strokeOpacity={0.18} />
                    <XAxis dataKey="label" tick={tickStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
                    <YAxis tick={tickStyle} tickFormatter={moedaCompacta} axisLine={false} tickLine={false} width={64} />
                    <Tooltip
                      cursor={{ fill: "#94a3b8", fillOpacity: 0.08 }}
                      formatter={(v) => [brl(Number(v)), "Diárias"]}
                      labelFormatter={(_, payload) => {
                        const dia = (payload?.[0]?.payload as { dia?: string } | undefined)?.dia;
                        return dia ? diaLongo(dia) : "";
                      }}
                    />
                    <Bar dataKey="total" name="Diárias" fill={COR_DIARIA} radius={[4, 4, 0, 0]} maxBarSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              )}

              {dadosDiarias.length > 0 && (
                <details>
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Ver dados em tabela</summary>
                  <table className="mt-2 text-sm w-full max-w-md">
                    <thead className="text-xs text-muted-foreground uppercase border-b border-border">
                      <tr><th className="text-left py-1.5 pr-4 font-semibold">Dia</th><th className="text-right py-1.5 font-semibold">Total</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {dadosDiarias.map((d) => (
                        <tr key={d.dia}>
                          <td className="py-1.5 pr-4">{diaLongo(d.dia)}</td>
                          <td className="py-1.5 text-right tabular-nums">{brl(d.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </div>

            {/* ── Folha de pagamento mensal ───────────────────────────────── */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-info" />
                  <h2 className="font-semibold text-foreground">Folha de pagamento mensal</h2>
                </div>
                {ultimaFolha && (
                  <div className="ml-auto flex items-center gap-5 text-right">
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Última competência ({ultimaFolha.label})</p>
                      <p className="text-lg font-bold tabular-nums">{brl(ultimaFolha.Bruto)} <span className="text-xs font-normal text-muted-foreground">bruto</span></p>
                    </div>
                  </div>
                )}
              </div>

              {dadosFolha.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">Nenhuma folha de pagamento lançada.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dadosFolha} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#94a3b8" strokeOpacity={0.18} />
                    <XAxis dataKey="label" tick={tickStyle} axisLine={false} tickLine={false} />
                    <YAxis tick={tickStyle} tickFormatter={moedaCompacta} axisLine={false} tickLine={false} width={64} />
                    <Tooltip
                      cursor={{ fill: "#94a3b8", fillOpacity: 0.08 }}
                      formatter={(v, name) => [brl(Number(v)), String(name)]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Bruto" fill={COR_BRUTO} radius={[4, 4, 0, 0]} maxBarSize={30} />
                    <Bar dataKey="Líquido" fill={COR_LIQUIDO} radius={[4, 4, 0, 0]} maxBarSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              )}

              {dadosFolha.length > 0 && (
                <details>
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Ver dados em tabela</summary>
                  <table className="mt-2 text-sm w-full max-w-lg">
                    <thead className="text-xs text-muted-foreground uppercase border-b border-border">
                      <tr>
                        <th className="text-left py-1.5 pr-4 font-semibold">Competência</th>
                        <th className="text-right py-1.5 pr-4 font-semibold">Bruto</th>
                        <th className="text-right py-1.5 pr-4 font-semibold">Líquido</th>
                        <th className="text-center py-1.5 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {dadosFolha.map((f) => (
                        <tr key={f.label}>
                          <td className="py-1.5 pr-4">{f.label}</td>
                          <td className="py-1.5 pr-4 text-right tabular-nums">{brl(f.Bruto)}</td>
                          <td className="py-1.5 pr-4 text-right tabular-nums">{brl(f.Líquido)}</td>
                          <td className="py-1.5 text-center">
                            <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold", f.status === "FECHADA" ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
                              {f.status === "FECHADA" ? "Fechada" : "Em revisão"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
