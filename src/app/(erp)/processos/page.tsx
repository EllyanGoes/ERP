"use client";

// Painel de processos externos: o que fazer esta semana, prazos, parados e valores em discussão.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { AlertTriangle, CalendarClock, Gavel, Hourglass, Loader2, Plus, Scale } from "lucide-react";
import { PrazoChip, RISCOS, SituacaoBadge, TIPOS_PROCESSO, fmtBRL, type LinhaProcesso } from "@/components/processos/comum";

type Linha = LinhaProcesso & { valorCausa: string | null; riscoPerda: string | null; prazos: { id: string; descricao: string; vence: string; avisoDias: number }[] };

export default function ProcessosPainelPage() {
  useTabTitle("Processos");
  const [rows, setRows] = useState<Linha[]>([]); const [loading, setLoading] = useState(true); const [pode, setPode] = useState(false);
  useEffect(() => { fetch("/api/processos").then((r) => r.json()).then((j) => { setRows(j.data ?? []); setPode(!!j.podeEditar); }).finally(() => setLoading(false)); }, []);

  const hoje = new Date(new Date().toDateString()).getTime();
  const prazos = useMemo(() => rows.flatMap((r) => r.prazos.map((p) => ({ ...p, processo: r }))).sort((a, b) => +new Date(a.vence) - +new Date(b.vence)), [rows]);
  const vencidos = prazos.filter((p) => +new Date(p.vence) < hoje);
  const semana = prazos.filter((p) => +new Date(p.vence) >= hoje && +new Date(p.vence) <= hoje + 7 * 86_400_000);
  const aguardando = rows.filter((r) => r.situacao === "AGUARDANDO_EMPRESA");
  const parados = rows.filter((r) => r.pendencias.some((p) => p.tipo === "SEM_ANDAMENTO"));
  const porRisco = Object.keys(RISCOS).map((k) => ({ k, total: rows.filter((r) => r.riscoPerda === k).reduce((s, r) => s + Number(r.valorCausa ?? 0), 0) }));
  const porTipo = Object.entries(TIPOS_PROCESSO).map(([k, label]) => ({ k, label, n: rows.filter((r) => r.tipo === k).length })).filter((x) => x.n);

  const Card = ({ icon, titulo, valor, cor, href }: { icon: React.ReactNode; titulo: string; valor: number; cor?: string; href: string }) => (
    <Link href={href} className="bg-card border border-border rounded-xl p-4 hover:bg-muted/40">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{titulo}</div>
      <div className={cn("text-2xl font-semibold mt-1 tabular-nums", cor)}>{valor}</div>
    </Link>
  );

  return (
    <div>
      <PageHeader title="Processos" subtitle="Painel dos processos jurídicos e administrativos externos" breadcrumbs={[{ label: "Processos" }]}
        action={pode ? <Link href="/processos/lista?novo=1"><Button className="bg-blue-600 hover:bg-blue-700 gap-1.5"><Plus className="w-4 h-4" /> Novo processo</Button></Link> : undefined} />
      <div className="px-8 pb-8 space-y-5">
        {loading ? <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : (<>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Card icon={<Gavel className="w-3.5 h-3.5" />} titulo="Processos ativos" valor={rows.length} href="/processos/lista" />
            <Card icon={<AlertTriangle className="w-3.5 h-3.5" />} titulo="Prazos vencidos" valor={vencidos.length} cor={vencidos.length ? "text-danger" : undefined} href="/processos/lista" />
            <Card icon={<CalendarClock className="w-3.5 h-3.5" />} titulo="Prazos em 7 dias" valor={semana.length} cor={semana.length ? "text-warning" : undefined} href="/processos/lista" />
            <Card icon={<Hourglass className="w-3.5 h-3.5" />} titulo="Aguardando a empresa" valor={aguardando.length} cor={aguardando.length ? "text-warning" : undefined} href="/processos/lista" />
            <Card icon={<Hourglass className="w-3.5 h-3.5" />} titulo="Parados" valor={parados.length} href="/processos/lista" />
          </div>
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-card border border-border rounded-xl">
              <div className="px-4 py-3 border-b border-border text-sm font-semibold">O que fazer</div>
              <ul className="divide-y divide-border/60">
                {[...vencidos, ...semana].map((p) => (
                  <li key={p.id} className="px-4 py-2.5 flex items-start gap-3">
                    <PrazoChip vence={p.vence} avisoDias={p.avisoDias} />
                    <div className="min-w-0"><div className="text-sm">{p.descricao}</div><Link href={`/processos/${p.processo.id}`} className="text-xs text-info hover:underline">{p.processo.codigo} · {p.processo.titulo}</Link></div>
                  </li>
                ))}
                {aguardando.map((r) => (
                  <li key={`a${r.id}`} className="px-4 py-2.5 flex items-start gap-3">
                    <SituacaoBadge s={r.situacao} />
                    <Link href={`/processos/${r.id}`} className="text-sm hover:underline">{r.codigo} · {r.titulo}</Link>
                  </li>
                ))}
                {!vencidos.length && !semana.length && !aguardando.length && <li className="px-4 py-8 text-center text-sm text-muted-foreground">Nada urgente: sem prazo vencido ou nos próximos 7 dias.</li>}
              </ul>
            </div>
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="text-sm font-semibold flex items-center gap-1.5 mb-2"><Scale className="w-4 h-4" /> Valor em discussão</div>
                {porRisco.map((x) => <div key={x.k} className="flex justify-between text-sm py-0.5"><span className="text-muted-foreground">Risco {RISCOS[x.k].toLowerCase()}</span><span className="tabular-nums">{fmtBRL(x.total)}</span></div>)}
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="text-sm font-semibold mb-2">Por tipo</div>
                {porTipo.length ? porTipo.map((x) => <div key={x.k} className="flex justify-between text-sm py-0.5"><span className="text-muted-foreground">{x.label}</span><span>{x.n}</span></div>) : <p className="text-xs text-muted-foreground">Nenhum processo ativo.</p>}
              </div>
            </div>
          </div>
        </>)}
      </div>
    </div>
  );
}
