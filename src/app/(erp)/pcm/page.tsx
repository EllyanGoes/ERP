"use client";

// Painel da Manutenção: o que está parado agora, o que precisa de atenção (SS,
// OS urgentes/atrasadas, a validar), backlog por equipe, aderência do mês,
// disponibilidade dos críticos A e custo mensal.
import { useEffect, useState } from "react";
import Link from "next/link";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import PageHeader from "@/components/shared/PageHeader";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { AlertTriangle, Loader2 } from "lucide-react";
import { PrioridadeTxt, StatusOSBadge, brl, fmtData, fmtDataHora, fmtHoras } from "@/components/manutencao/comum";

type Painel = {
  parados: { id: string; codApl: number; tag: string; nome: string; os: { id: string; numero: string; paradaInicio: string } | null }[];
  ss: { aguardando: number; urgentes: number };
  os: { abertas: number; aValidar: number; atrasadas: number; emergencia: number; urgentes: { id: string; numero: string; status: string; prioridade: string; descricao: string; prazo: string | null; atrasada: boolean; ativo: { tag: string; nome: string } | null }[] };
  backlog: { horas: number; capacidadeSemanal: number; semanas: number | null; semEstimativa: number; equipes: { id: string; nome: string; horas: number; membros: number; semanas: number | null }[] };
  aderencia: { vencidas: number; noPrazo: number; percentual: number | null };
  mix30: { total: number; corretivas: number; percentualCorretiva: number | null };
  custo: { meses: { label: string; maoObra: number; material: number; terceiros: number; total: number }[]; mesAtual: number; mediaSeisMeses: number };
  disponibilidadeA: { ativos: number; horasParada: number; falhas: number; percentual: number | null };
};

// Ordem categórica fixa (validada p/ CVD nos temas claro e escuro).
const COR = { maoObra: "#3b82f6", material: "#0d9488", terceiros: "#d97706" };
const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(0)}%`);

export default function PainelManutencaoPage() {
  useTabTitle("Manutenção");
  const [d, setD] = useState<Painel | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    fetch("/api/pcm/painel").then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j.data); }).catch((e) => setErro(e.message || "Erro ao carregar."));
  }, []);
  const agora = Date.now();

  return (
    <div>
      <PageHeader title="Manutenção" subtitle="Situação da fábrica agora e indicadores do mês" breadcrumbs={[{ label: "Manutenção" }, { label: "Painel" }]} />
      <div className="px-8 pb-10 space-y-4">
        {erro && <p className="text-sm text-danger">{erro}</p>}
        {!d && !erro && <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}
        {d && <>
          {/* Parados agora */}
          <div className={cn("rounded-xl border p-4", d.parados.length ? "border-danger/40 bg-danger/5" : "border-border bg-card")}>
            <div className="flex items-center gap-2 text-sm font-semibold">{d.parados.length ? <AlertTriangle className="w-4 h-4 text-danger" /> : null}{d.parados.length ? `${d.parados.length} ativo(s) parado(s) agora` : "Nenhum ativo parado"}</div>
            {d.parados.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {d.parados.map((a) => (
                  <Link key={a.id} href={a.os ? `/pcm/os/${a.os.id}` : `/pcm/ativos?ativo=${a.codApl}`} className="text-xs bg-card border border-danger/30 rounded-lg px-2.5 py-1.5 hover:bg-muted">
                    <b>{a.tag}</b> {a.nome}{a.os && <span className="text-muted-foreground"> · {a.os.numero} · há {fmtHoras((agora - new Date(a.os.paradaInicio).getTime()) / 3_600_000)}</span>}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Números */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Tile titulo="Solicitações p/ triar" valor={d.ss.aguardando} href="/pcm/solicitacoes" alerta={d.ss.urgentes > 0} nota={d.ss.urgentes ? `${d.ss.urgentes} com máquina parada` : undefined} />
            <Tile titulo="OS em aberto" valor={d.os.abertas} href="/pcm/os" nota={d.os.emergencia ? `${d.os.emergencia} emergência` : undefined} alerta={d.os.emergencia > 0} />
            <Tile titulo="OS atrasadas" valor={d.os.atrasadas} href="/pcm/os" alerta={d.os.atrasadas > 0} />
            <Tile titulo="A validar (PCM)" valor={d.os.aValidar} href="/pcm/os" />
            <Tile titulo="Aderência às preventivas" valor={pct(d.aderencia.percentual)} href="/pcm/planos" nota={`${d.aderencia.noPrazo} de ${d.aderencia.vencidas} no prazo no mês`} />
            <Tile titulo="Corretivas (30 dias)" valor={pct(d.mix30.percentualCorretiva)} nota={`${d.mix30.corretivas} de ${d.mix30.total} OS abertas`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* OS urgentes */}
            <div className="lg:col-span-2 bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-2">Prioridade e atraso</h3>
              {d.os.urgentes.length === 0 ? <p className="text-xs text-muted-foreground">Nada urgente nem atrasado.</p> : (
                <table className="w-full text-sm">
                  <tbody>{d.os.urgentes.map((o) => (
                    <tr key={o.id} className="border-t border-border/60 first:border-t-0">
                      <td className="py-1.5 pr-2"><Link href={`/pcm/os/${o.id}`} className="font-medium hover:underline">{o.numero}</Link></td>
                      <td className="py-1.5 pr-2 text-xs">{o.ativo ? `${o.ativo.tag} ${o.ativo.nome}` : "—"}<div className="text-muted-foreground truncate max-w-[22rem]">{o.descricao}</div></td>
                      <td className="py-1.5 pr-2"><PrioridadeTxt p={o.prioridade} /></td>
                      <td className={cn("py-1.5 pr-2 text-xs whitespace-nowrap", o.atrasada ? "text-danger font-medium" : "text-muted-foreground")}>{fmtData(o.prazo)}{o.atrasada && " · atrasada"}</td>
                      <td className="py-1.5"><StatusOSBadge s={o.status} /></td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>

            {/* Disponibilidade + backlog */}
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-sm font-semibold">Disponibilidade dos críticos A (mês)</h3>
                {d.disponibilidadeA.ativos === 0 ? <p className="text-xs text-muted-foreground mt-1">Nenhum ativo classificado como A. <Link href="/pcm/ativos" className="text-info hover:underline">Classificar</Link></p> : <>
                  <div className="text-3xl font-semibold mt-1 tabular-nums">{pct(d.disponibilidadeA.percentual)}</div>
                  <p className="text-xs text-muted-foreground">{d.disponibilidadeA.ativos} ativos · {d.disponibilidadeA.falhas} falha(s) · {fmtHoras(d.disponibilidadeA.horasParada)} parados</p>
                </>}
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-sm font-semibold">Backlog</h3>
                <div className="text-3xl font-semibold mt-1 tabular-nums">{d.backlog.semanas == null ? "—" : `${d.backlog.semanas.toFixed(1).replace(".", ",")} sem.`}</div>
                <p className="text-xs text-muted-foreground">{Math.round(d.backlog.horas)} h de serviço ÷ {d.backlog.capacidadeSemanal} h/semana das equipes{d.backlog.semEstimativa ? ` · ${d.backlog.semEstimativa} OS sem estimativa (contadas 2 h)` : ""}</p>
                {d.backlog.capacidadeSemanal === 0 && <p className="text-xs text-warning mt-1">Cadastre os membros das equipes em <Link href="/pcm/configuracoes" className="underline">Configurações</Link> para calcular.</p>}
                <ul className="mt-2 space-y-0.5 text-xs">{d.backlog.equipes.slice(0, 6).map((e) => <li key={e.id} className="flex justify-between"><span>{e.nome}</span><span className="text-muted-foreground tabular-nums">{Math.round(e.horas)} h{e.semanas != null ? ` · ${e.semanas.toFixed(1).replace(".", ",")} sem.` : ""}</span></li>)}</ul>
              </div>
            </div>
          </div>

          {/* Custo mensal */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">Custo de manutenção por mês (OS concluídas)</h3>
              <p className="text-xs text-muted-foreground">Mês atual <b className="text-foreground">{brl(d.custo.mesAtual)}</b> · média dos 6 anteriores {brl(d.custo.mediaSeisMeses)} · <Link href="/pcm/relatorios" className="text-info hover:underline">detalhar</Link></p>
            </div>
            <div className="h-64 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.custo.meses} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)} mil` : String(v))} />
                  <Tooltip formatter={(v) => brl(Number(v))} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="maoObra" name="Mão de obra" stackId="c" fill={COR.maoObra} stroke="hsl(var(--card))" strokeWidth={1} />
                  <Bar dataKey="material" name="Material" stackId="c" fill={COR.material} stroke="hsl(var(--card))" strokeWidth={1} />
                  <Bar dataKey="terceiros" name="Terceiros" stackId="c" fill={COR.terceiros} stroke="hsl(var(--card))" strokeWidth={1} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Atualizado {fmtDataHora(new Date().toISOString())}. Mão de obra = horas apontadas × custo-hora; material = requisições atendidas vinculadas à OS (e o histórico do Engeman).</p>
          </div>
        </>}
      </div>
    </div>
  );
}

function Tile({ titulo, valor, nota, href, alerta }: { titulo: string; valor: number | string; nota?: string; href?: string; alerta?: boolean }) {
  const corpo = (
    <div className={cn("bg-card border rounded-xl p-3 h-full", alerta ? "border-danger/40" : "border-border", href && "hover:bg-muted/40")}>
      <div className="text-xs text-muted-foreground">{titulo}</div>
      <div className={cn("text-2xl font-semibold tabular-nums mt-0.5", alerta && "text-danger")}>{valor}</div>
      {nota && <div className="text-[11px] text-muted-foreground mt-0.5">{nota}</div>}
    </div>
  );
  return href ? <Link href={href}>{corpo}</Link> : corpo;
}
