"use client";

// Painel de contratos: comprometido/mês, vencimentos, decisões, reajustes e
// a agenda dos próximos eventos projetados pelo motor.
import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { Loader2, Plus, CalendarClock, AlertTriangle } from "lucide-react";
import { SeveridadeBadge, TIPO_EVENTO, fmtBRL, fmtData, type Pendencia } from "@/components/contratos/comum";

type Painel = {
  totais: { vigentes: number; minutas: number; suspensos: number; comprometidoMes: number; receitaMes: number; vencem90: number; decisoes: number; reajustes: number; semDocumento: number };
  porSeveridade: Record<string, number>; pendencias: Pendencia[];
  proximos: { tipo: string; data: string; descricao: string; contrato: { id: string; numero: string; titulo: string; contraparte: string | null } }[];
};

export default function ContratosPainelPage() {
  useTabTitle("Contratos — Painel");
  const [p, setP] = useState<Painel | null>(null);
  useEffect(() => { fetch("/api/contratos/painel").then((r) => r.json()).then((j) => setP(j.data ?? null)).catch(() => {}); }, []);
  if (!p) return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  const t = p.totais;
  const ordem = ["CRITICA", "ALTA", "MEDIA", "BAIXA"];
  const pend = [...p.pendencias].sort((a, b) => ordem.indexOf(a.severidade) - ordem.indexOf(b.severidade));
  const Card = ({ label, value, sub, cls, href }: { label: string; value: string | number; sub?: string; cls?: string; href?: string }) => {
    const inner = <><p className="text-xs text-muted-foreground">{label}</p><p className={cn("text-2xl font-semibold tabular-nums", cls)}>{value}</p>{sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}</>;
    return href ? <Link href={href} className="bg-card rounded-xl border border-border p-4 hover:border-info/50 block">{inner}</Link> : <div className="bg-card rounded-xl border border-border p-4">{inner}</div>;
  };
  return (
    <div>
      <PageHeader title="Contratos" subtitle="Vigência, renovação, reajuste e comprometido — por empresa" breadcrumbs={[{ label: "Contratos" }]}
        action={<Link href="/contratos/lista?novo=1"><Button className="bg-blue-600 hover:bg-blue-700 gap-1.5"><Plus className="w-4 h-4" /> Novo contrato</Button></Link>} />
      <div className="px-8 pb-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          <Card label="Vigentes" value={t.vigentes} sub={`${t.minutas} minuta(s) · ${t.suspensos} suspenso(s)`} href="/contratos/lista" />
          <Card label="Comprometido / mês" value={fmtBRL(t.comprometidoMes)} sub="contratos de despesa" />
          <Card label="Receita contratada / mês" value={fmtBRL(t.receitaMes)} sub="contratos de receita" />
          <Card label="Vencem em 90 dias" value={t.vencem90} cls={t.vencem90 ? "text-warning" : ""} href="/contratos/lista?vence=90" />
          <Card label="Decisões pendentes" value={t.decisoes} sub="renovar / rescindir" cls={t.decisoes ? "text-danger" : ""} />
          <Card label="Reajustes a aplicar" value={t.reajustes} cls={t.reajustes ? "text-warning" : ""} />
          <Card label="Sem documento" value={t.semDocumento} cls={t.semDocumento ? "text-danger" : ""} />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <section className="bg-card rounded-xl border border-border">
            <div className="px-4 py-3 border-b border-border bg-muted flex items-center justify-between"><h2 className="font-semibold text-sm text-foreground inline-flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Pendências</h2><span className="text-xs text-muted-foreground">{p.porSeveridade.CRITICA} críticas · {p.porSeveridade.ALTA} altas · {p.porSeveridade.MEDIA} médias</span></div>
            {pend.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground italic">Nenhuma pendência — tudo regular.</p> : (
              <ul className="divide-y divide-border/60 max-h-[32rem] overflow-y-auto">
                {pend.map((x, i) => (
                  <li key={i} className="px-4 py-2 flex items-start gap-3">
                    <SeveridadeBadge s={x.severidade} />
                    <div className="min-w-0 flex-1">
                      <Link href={x.link} className="text-sm text-foreground hover:text-info"><span className="text-xs text-muted-foreground">{x.contratoNumero}</span> {x.contratoTitulo} — {x.titulo}</Link>
                      {x.detalhe && <p className="text-xs text-muted-foreground">{x.detalhe}</p>}
                    </div>
                    {x.vence && <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtData(x.vence)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="bg-card rounded-xl border border-border">
            <div className="px-4 py-3 border-b border-border bg-muted"><h2 className="font-semibold text-sm text-foreground inline-flex items-center gap-2"><CalendarClock className="w-4 h-4" /> Agenda — próximos 180 dias</h2></div>
            {p.proximos.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground italic">Nenhum evento previsto.</p> : (
              <ul className="divide-y divide-border/60 max-h-[32rem] overflow-y-auto">
                {p.proximos.map((e, i) => {
                  const d = Math.ceil((new Date(e.data).getTime() - Date.now()) / 86_400_000);
                  return (
                    <li key={i} className="px-4 py-2 flex items-center gap-3 text-sm">
                      <span className={cn("w-24 text-xs tabular-nums whitespace-nowrap", d < 0 ? "text-danger" : d <= 30 ? "text-warning" : "text-muted-foreground")}>{fmtData(e.data)}<br /><span className="text-[10px]">{d < 0 ? `há ${-d} d` : `em ${d} d`}</span></span>
                      <span className={cn("text-[11px] px-1.5 py-0.5 rounded border whitespace-nowrap", e.tipo === "JANELA_AVISO_PREVIO" ? "border-danger/30 text-danger bg-danger/5" : e.tipo === "REAJUSTE_PROJETADO" ? "border-info/30 text-info bg-info/5" : "border-border text-muted-foreground")}>{TIPO_EVENTO[e.tipo] ?? e.tipo}</span>
                      <Link href={`/contratos/${e.contrato.id}`} className="flex-1 min-w-0 truncate text-foreground hover:text-info"><span className="text-xs text-muted-foreground">{e.contrato.numero}</span> {e.contrato.titulo}{e.contrato.contraparte && <span className="text-xs text-muted-foreground"> · {e.contrato.contraparte}</span>}</Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
