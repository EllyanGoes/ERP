"use client";

// Visão GRÁFICO dos títulos (Contas a Pagar E a Receber — rótulos por props):
// BARRAS do valor por data de
// vencimento, com granularidade dia/mês/ano. Recebe os títulos já filtrados por
// status/fornecedor/natureza/busca (o recorte de período/mês NÃO se aplica aqui —
// o gráfico mostra o horizonte inteiro da dívida). Série única (sem legenda);
// o acumulado fica no tooltip; linha tracejada marca HOJE, separando o vencido
// do a vencer.

import { useMemo, useState } from "react";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn, formatBRL, formatDate } from "@/lib/utils";
import {
  ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, ReferenceLine,
} from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StatusBadge from "@/components/shared/StatusBadge";

export type PontoGrafico = {
  venc: string | null;
  valor: number;
  // Detalhe do título p/ o popup ao clicar na barra.
  id?: string;
  numero?: string;
  fornecedor?: string | null;
  descricao?: string | null;
  parcela?: string | null;
  status?: string;
};
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
// Cores por status — o mesmo vocabulário dos blocos de totais da tela
// (Vencido vermelho, A vencer azul, Pago verde).
const COR_STATUS = {
  vencido: "hsl(var(--danger))",
  aVencer: "#0ea5e9",
  pago: "hsl(var(--success))",
} as const;

// R$ compacto p/ eixo (1,2 mi · 350 mil) — rótulo curto, tooltip tem o exato.
function brlCompacto(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export default function TitulosGrafico({
  pontos, onAbrirTitulo,
  titulo = "Contas a pagar por vencimento",
  subtitulo = "Respeita os filtros de status/fornecedor/natureza; o recorte de mês/período não se aplica (horizonte completo).",
  parceiroHeader = "Fornecedor",
  rotuloPago = "Pago",
  granKey = "financeiro:contas-pagar:grafico-gran",
}: {
  pontos: PontoGrafico[];
  // Clique no Nº do título dentro do popup da barra — abre o detalhe do título
  // (o pai, que conhece as contas, decide como abrir).
  onAbrirTitulo?: (id: string) => void;
  // Rótulos parametrizáveis: o mesmo gráfico atende Contas a Pagar e a Receber.
  titulo?: string;
  subtitulo?: string;
  parceiroHeader?: string;
  rotuloPago?: string;
  granKey?: string;
}) {
  const [gran, setGran] = usePersistedState<Granularidade>(granKey, "mes");
  // Barra clicada → popup com a lista de títulos do período.
  const [bucketAberto, setBucketAberto] = useState<string | null>(null);

  const { serie, semVenc, chaveHoje } = useMemo(() => {
    const hoje = new Date();
    const isoHoje = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
    // Pilha por STATUS dentro de cada bucket: vencido (aberto, venc < hoje),
    // a vencer (aberto, venc ≥ hoje) e pago (PAGA — só entra quando o filtro
    // de status da tela inclui pagas). Mesmas categorias dos blocos de totais.
    const porBucket = new Map<string, { vencido: number; aVencer: number; pago: number }>();
    let semVencTotal = 0, semVencQtd = 0;
    for (const p of pontos) {
      if (!p.venc) { semVencTotal += p.valor; semVencQtd++; continue; }
      const k = chaveBucket(p.venc, gran);
      const b = porBucket.get(k) ?? { vencido: 0, aVencer: 0, pago: 0 };
      if (p.status === "PAGA") b.pago += p.valor;
      else if (p.venc < isoHoje) b.vencido += p.valor;
      else b.aVencer += p.valor;
      porBucket.set(k, b);
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const chaves = Array.from(porBucket.keys()).sort();
    let acumulado = 0;
    const serie = chaves.map((k) => {
      const b = porBucket.get(k)!;
      const doBucket = r2(b.vencido + b.aVencer + b.pago);
      acumulado = r2(acumulado + doBucket);
      return {
        chave: k, label: labelBucket(k, gran),
        vencido: r2(b.vencido), aVencer: r2(b.aVencer), pago: r2(b.pago),
        doBucket, acumulado,
      };
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
          <p className="text-sm font-semibold text-foreground">{titulo}</p>
          <p className="text-[11px] text-muted-foreground">
            {subtitulo}
            {semVenc.qtd > 0 && <> · {semVenc.qtd} título(s) sem vencimento fora do gráfico ({formatBRL(semVenc.total)})</>}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Legenda dos status (série empilhada). */}
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            {([["vencido", "Vencido"], ["aVencer", "A vencer"], ["pago", rotuloPago]] as const).map(([k, rot]) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COR_STATUS[k] }} />
                {rot}
              </span>
            ))}
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
      </div>
      {serie.length === 0 ? (
        <p className="text-sm text-muted-foreground py-14 text-center">Nenhum título com vencimento nos filtros atuais.</p>
      ) : (
        // Altura acompanha a viewport (aproveita a área abaixo do gráfico);
        // o mínimo preserva a leitura em janelas baixas.
        <div className="h-[max(380px,calc(100vh-27rem))]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={serie} margin={{ top: 16, right: 12, bottom: 4, left: 8 }}>
            <CartesianGrid vertical={false} stroke="#94a3b8" strokeOpacity={0.18} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={brlCompacto} axisLine={false} tickLine={false} width={58}
              label={{ value: "R$", position: "insideTopLeft", offset: 0, fontSize: 10, fill: "#94a3b8" }} />
            <Tooltip
              cursor={{ fill: "#94a3b8", fillOpacity: 0.12 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const p = (payload[0]?.payload ?? {}) as {
                  vencido?: number; aVencer?: number; pago?: number; doBucket?: number; acumulado?: number;
                };
                const linhas = [
                  { rot: "Vencido", v: p.vencido ?? 0, cor: COR_STATUS.vencido },
                  { rot: "A vencer", v: p.aVencer ?? 0, cor: COR_STATUS.aVencer },
                  { rot: rotuloPago, v: p.pago ?? 0, cor: COR_STATUS.pago },
                ].filter((l) => l.v > 0);
                return (
                  <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md space-y-0.5" style={{ fontSize: 12 }}>
                    <p className="font-medium text-foreground">{label}</p>
                    {linhas.map((l) => (
                      <p key={l.rot} className="text-muted-foreground flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-sm inline-block" style={{ background: l.cor }} />
                        {l.rot}: <b className="text-foreground">{formatBRL(l.v)}</b>
                      </p>
                    ))}
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
            {/* Pilha por status: vencido (base) → a vencer → pago (topo).
                O stroke na cor do card dá o respiro entre os segmentos. */}
            {([
              ["vencido", "Vencido", COR_STATUS.vencido, false],
              ["aVencer", "A vencer", COR_STATUS.aVencer, false],
              ["pago", rotuloPago, COR_STATUS.pago, true],
            ] as const).map(([key, nome, cor, topo]) => (
              <Bar key={key} dataKey={key} name={nome} stackId="s"
                fill={cor} fillOpacity={0.85}
                stroke="hsl(var(--card))" strokeWidth={1}
                {...(topo ? { radius: [4, 4, 0, 0] as [number, number, number, number] } : {})}
                maxBarSize={48}
                cursor="pointer"
                onClick={(d: { payload?: { chave?: string } }) => {
                  const chave = d?.payload?.chave;
                  if (chave) setBucketAberto(chave);
                }} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
        </div>
      )}

      {/* Popup da barra clicada: lista dos títulos com vencimento no período. */}
      <Dialog open={!!bucketAberto} onOpenChange={(o) => !o && setBucketAberto(null)}>
        {/* Largura explícita: o DialogContent tem sm:max-w-sm no base — a tabela
            de títulos precisa de mais para não cortar Valor/Status. */}
        <DialogContent className="w-[min(80rem,calc(100vw-2rem))] sm:max-w-none">
          <DialogHeader>
            <DialogTitle>
              Títulos com vencimento em {bucketAberto ? labelBucket(bucketAberto, gran) : ""}
            </DialogTitle>
          </DialogHeader>
          {(() => {
            if (!bucketAberto) return null;
            const doPeriodo = pontos
              .filter((p) => p.venc && chaveBucket(p.venc, gran) === bucketAberto)
              .sort((a, b) => (a.venc! < b.venc! ? -1 : a.venc! > b.venc! ? 1 : b.valor - a.valor));
            const total = doPeriodo.reduce((s, p) => s + p.valor, 0);
            return (
              <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border">
                {/* table-fixed com larguras explícitas: a tabela NUNCA excede o
                    dialog (sem scroll horizontal); só a Descrição flexiona. */}
                <table className="w-full table-fixed text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                      <th className="text-left px-3 py-2 w-28">Nº Título</th>
                      <th className="text-center px-3 py-2 w-20">Parcela</th>
                      <th className="text-left px-3 py-2 w-52">{parceiroHeader}</th>
                      <th className="text-left px-3 py-2">Descrição</th>
                      <th className="text-left px-3 py-2 w-28">Vencimento</th>
                      <th className="text-right px-3 py-2 w-32">Valor</th>
                      <th className="text-center px-3 py-2 w-24">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doPeriodo.map((p, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-mono text-xs font-semibold whitespace-nowrap">
                          {p.id && onAbrirTitulo ? (
                            <button
                              type="button"
                              className="text-info hover:underline"
                              title="Abrir o título"
                              // Abre o detalhe POR CIMA — a lista do período fica aberta atrás.
                              onClick={() => onAbrirTitulo(p.id!)}
                            >
                              {p.numero ?? "—"}
                            </button>
                          ) : (p.numero ?? "—")}
                        </td>
                        <td className="px-3 py-2 text-center text-muted-foreground whitespace-nowrap">{p.parcela ?? "—"}</td>
                        <td className="px-3 py-2"><div className="truncate" title={p.fornecedor ?? undefined}>{p.fornecedor ?? "—"}</div></td>
                        <td className="px-3 py-2 text-muted-foreground">
                          <div className="truncate" title={p.descricao ?? undefined}>{p.descricao ?? "—"}</div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{p.venc ? formatDate(p.venc) : "—"}</td>
                        <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{formatBRL(p.valor)}</td>
                        <td className="px-3 py-2 text-center">{p.status ? <StatusBadge status={p.status} /> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/60 border-t border-border font-semibold">
                      <td colSpan={5} className="px-3 py-2 text-xs text-muted-foreground uppercase">
                        {doPeriodo.length} título(s)
                      </td>
                      <td className="px-3 py-2 text-right">{formatBRL(total)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
