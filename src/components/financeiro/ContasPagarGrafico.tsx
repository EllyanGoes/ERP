"use client";

// Visão GRÁFICO do Contas a Pagar: curva ACUMULADA do valor a pagar pela data de
// vencimento, com granularidade dia/mês/ano. Recebe os títulos já filtrados por
// status/fornecedor/natureza/busca (o recorte de período/mês NÃO se aplica aqui —
// o gráfico mostra o horizonte inteiro da dívida). Série única (sem legenda);
// linha tracejada marca HOJE, separando o vencido do a vencer.

import { useMemo } from "react";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn, formatBRL } from "@/lib/utils";
import {
  ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, Tooltip,
  CartesianGrid, ReferenceLine,
} from "recharts";

export type PontoGrafico = { venc: string | null; valor: number };
type Granularidade = "dia" | "mes" | "ano";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function chaveBucket(iso: string, g: Granularidade): string {
  return g === "dia" ? iso : g === "mes" ? iso.slice(0, 7) : iso.slice(0, 4);
}
function labelBucket(chave: string, g: Granularidade): string {
  if (g === "ano") return chave;
  const [a, m, d] = chave.split("-");
  if (g === "mes") return `${MESES[Number(m) - 1]}/${a.slice(2)}`;
  return `${d}/${m}/${a.slice(2)}`;
}
// R$ compacto p/ eixo (1,2 mi · 350 mil) — rótulo curto, tooltip tem o exato.
function brlCompacto(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export default function ContasPagarGrafico({ pontos }: { pontos: PontoGrafico[] }) {
  const [gran, setGran] = usePersistedState<Granularidade>("financeiro:contas-pagar:grafico-gran", "mes");

  const { serie, semVenc, chaveHoje } = useMemo(() => {
    const hoje = new Date();
    const isoHoje = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
    const porBucket = new Map<string, number>();
    let semVencTotal = 0, semVencQtd = 0;
    for (const p of pontos) {
      if (!p.venc) { semVencTotal += p.valor; semVencQtd++; continue; }
      const k = chaveBucket(p.venc, gran);
      porBucket.set(k, (porBucket.get(k) ?? 0) + p.valor);
    }
    const chaves = Array.from(porBucket.keys()).sort();
    let acumulado = 0;
    const serie = chaves.map((k) => {
      const doBucket = Math.round((porBucket.get(k) ?? 0) * 100) / 100;
      acumulado = Math.round((acumulado + doBucket) * 100) / 100;
      return { chave: k, label: labelBucket(k, gran), doBucket, acumulado };
    });
    // Bucket de HOJE (p/ a linha de referência): o que contém a data corrente.
    const kHoje = chaveBucket(isoHoje, gran);
    const chaveHoje = serie.find((s) => s.chave >= kHoje)?.chave ?? null;
    return { serie, semVenc: { total: semVencTotal, qtd: semVencQtd }, chaveHoje };
  }, [pontos, gran]);

  const rotuloBucket = gran === "dia" ? "No dia" : gran === "mes" ? "No mês" : "No ano";

  return (
    <div className="rounded-xl border border-border bg-card shadow-md px-4 pt-3 pb-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">Contas a pagar acumuladas por vencimento</p>
          <p className="text-[11px] text-muted-foreground">
            Respeita os filtros de status/fornecedor/natureza; o recorte de mês/período não se aplica (horizonte completo).
            {semVenc.qtd > 0 && <> · {semVenc.qtd} título(s) sem vencimento fora do gráfico ({formatBRL(semVenc.total)})</>}
          </p>
        </div>
        {/* Granularidade: segmentado dia/mês/ano. */}
        <div className="inline-flex items-center rounded-lg border border-border overflow-hidden">
          {(["dia", "mes", "ano"] as Granularidade[]).map((g) => (
            <button key={g} type="button" onClick={() => setGran(g)}
              className={cn("px-3 h-8 text-xs font-medium transition-colors",
                gran === g ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted")}>
              {g === "dia" ? "Dia" : g === "mes" ? "Mês" : "Ano"}
            </button>
          ))}
        </div>
      </div>
      {serie.length === 0 ? (
        <p className="text-sm text-muted-foreground py-14 text-center">Nenhum título com vencimento nos filtros atuais.</p>
      ) : (
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={serie} margin={{ top: 16, right: 12, bottom: 4, left: 8 }}>
            <CartesianGrid vertical={false} stroke="#94a3b8" strokeOpacity={0.18} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={brlCompacto} axisLine={false} tickLine={false} width={58}
              label={{ value: "R$", position: "insideTopLeft", offset: 0, fontSize: 10, fill: "#94a3b8" }} />
            <Tooltip
              cursor={{ stroke: "#94a3b8", strokeOpacity: 0.35 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const p = (payload[0]?.payload ?? {}) as { doBucket?: number; acumulado?: number };
                return (
                  <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md space-y-0.5" style={{ fontSize: 12 }}>
                    <p className="font-medium text-foreground">{label}</p>
                    <p className="text-muted-foreground">{rotuloBucket}: <b className="text-foreground">{formatBRL(p.doBucket ?? 0)}</b></p>
                    <p className="text-muted-foreground">Acumulado: <b className="text-foreground">{formatBRL(p.acumulado ?? 0)}</b></p>
                  </div>
                );
              }}
            />
            {/* HOJE: separa visualmente o vencido (à esquerda) do a vencer. */}
            {chaveHoje && (
              <ReferenceLine x={serie.find((s) => s.chave === chaveHoje)?.label} stroke="#94a3b8" strokeDasharray="4 4"
                label={{ value: "hoje", position: "top", fontSize: 10, fill: "#94a3b8" }} />
            )}
            <Area type="stepAfter" dataKey="acumulado" name="Acumulado"
              stroke="hsl(var(--warning))" strokeWidth={2}
              fill="hsl(var(--warning))" fillOpacity={0.12}
              dot={false} activeDot={{ r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
