"use client";

// Bloco "Indicadores" do painel lateral do ativo: MTBF, MTTR, disponibilidade e
// confiabilidade dos últimos 12 meses + mini tendência (mesma API da tela
// /pcm/indicadores, filtrada por ativoId).
import { useEffect, useState } from "react";
import Link from "next/link";
import { ResponsiveContainer, BarChart, Bar, Tooltip, XAxis } from "recharts";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IndicadoresResponse } from "@/lib/manutencao/confiabilidade";

const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const fmtHrs = (h: number | null | undefined) => (h == null ? "—" : h >= 100 ? `${Math.round(h).toLocaleString("pt-BR")} h` : `${num.format(h)} h`);
const fmtPct = (v: number | null | undefined, casas = 1) => (v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: v >= 0.999 && v < 1 ? 2 : casas })}%`);
const iso = (d: Date) => d.toLocaleDateString("sv-SE");

export default function AtivoIndicadores({ ativoId }: { ativoId: string }) {
  const [d, setD] = useState<IndicadoresResponse | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    setD(null); setErro(false);
    const hoje = new Date();
    const p = new URLSearchParams({ ativoId, de: iso(new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1)), ate: iso(hoje), horizonteDias: "30" });
    fetch(`/api/pcm/indicadores?${p}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => setD(j.data)).catch(() => setErro(true));
  }, [ativoId]);

  return (
    <section className="border-t border-border pt-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Indicadores · 12 meses</h3>
        <Link href={`/pcm/indicadores?ativoId=${ativoId}`} className="text-[11px] text-info hover:underline">Ver detalhes</Link>
      </div>
      {erro ? <p className="text-xs text-danger">Não foi possível calcular.</p>
        : !d ? <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
        : (
          <>
            <div className="grid grid-cols-4 gap-2">
              <Num label="MTBF" valor={fmtHrs(d.total.mtbf)} nota={`${d.total.falhas} falha(s)`} />
              <Num label="MTTR" valor={fmtHrs(d.total.mttr)} nota={`${fmtHrs(d.total.horasParada)} parado`} />
              <Num label="Disponib." valor={fmtPct(d.total.disponibilidade)} tom={d.total.disponibilidade == null ? "" : d.total.disponibilidade < 0.9 ? "text-danger" : d.total.disponibilidade < 0.97 ? "text-warning" : "text-success"} nota={`${d.total.ativos ? d.porAtivo[0]?.horasPorDia ?? 24 : 24} h/dia`} />
              <Num label="Confiab. 30 d" valor={d.total.confiabilidade == null ? "—" : fmtPct(d.total.confiabilidade, 0)} tom={d.total.confiabilidade == null ? "" : d.total.confiabilidade < 0.5 ? "text-danger" : d.total.confiabilidade < 0.8 ? "text-warning" : "text-success"} nota={d.total.confiabilidade == null ? "sem falhas" : "R(t) = e^(−t/MTBF)"} />
            </div>
            {/* mini tendência: falhas por mês */}
            <div className="h-14 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.tendencia} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" hide />
                  <Tooltip formatter={(v) => [String(v), "falhas"]} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11, borderRadius: 8, padding: "4px 8px" }} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                  <Bar dataKey="falhas" fill="#d97706" radius={[2, 2, 0, 0]} minPointSize={1} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-muted-foreground">Falhas por mês, {d.tendencia[0]?.label} → {d.tendencia[d.tendencia.length - 1]?.label}</p>
          </>
        )}
    </section>
  );
}

function Num({ label, valor, nota, tom }: { label: string; valor: string; nota: string; tom?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-muted-foreground truncate">{label}</p>
      <p className={cn("text-sm font-semibold tabular-nums truncate", tom)}>{valor}</p>
      <p className="text-[10px] text-muted-foreground truncate">{nota}</p>
    </div>
  );
}
