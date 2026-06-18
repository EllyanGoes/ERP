"use client";

import { useCallback, useEffect, useState } from "react";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { cn } from "@/lib/utils";
import { Factory, Flame, AlertTriangle, ShoppingCart, RefreshCw, Layers, Gauge } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface DashData {
  ordens: Record<string, number>;
  perdasPorEtapa: { nome: string; perda: number }[];
  biomassa: { kg: number; milheiros: number; porMilheiro: number | null };
  producaoPorEstado: Record<string, number>;
  filaPorCentro: { centro: string; count: number }[];
  mrp: { totalAComprar: number; porCategoria: { categoria: string; liquida: number }[] };
  demandaTotalMilheiros: number;
  fornos: { id: string; nome: string; capacidadePadrao: string | number | null; unidadeCapacidade: string | null }[];
}

const ESTADO = [
  { k: "UMIDO", l: "Úmido", c: "bg-info/10 text-info" },
  { k: "SECO", l: "Seco", c: "bg-warning/10 text-warning" },
  { k: "QUEIMADO", l: "Queimado", c: "bg-danger/10 text-danger" },
  { k: "ACABADO", l: "Acabado", c: "bg-success/10 text-success" },
];
function Kpi({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: typeof Factory; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <span className={cn("flex w-7 h-7 items-center justify-center rounded-lg", color)}><Icon className="w-4 h-4" /></span>
      </div>
      <p className="text-2xl font-semibold text-foreground mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export default function PcpDashboardPage() {
  useTabTitle("Dashboard do PCP");
  const [d, setD] = useState<DashData | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Simulação do forno (client-side)
  const [fornoId, setFornoId] = useState("");
  const [cicloH, setCicloH] = useState("24");
  const [horasDia, setHorasDia] = useState("24");
  const [horizonte, setHorizonte] = useState("30");

  const load = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const r = await fetch("/api/pcp/dashboard");
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao carregar");
      setD(j.data);
      if (j.data.fornos?.[0]) setFornoId(j.data.fornos[0].id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground gap-2 text-sm"><RefreshCw className="w-4 h-4 animate-spin" /> Carregando…</div>;
  if (erro || !d) return <div className="flex flex-col items-center justify-center h-full gap-2"><AlertTriangle className="w-7 h-7 text-amber-400" /><p className="text-sm text-muted-foreground">{erro ?? "Sem dados"}</p></div>;

  const opAbertas = (d.ordens.LIBERADA ?? 0) + (d.ordens.EM_PRODUCAO ?? 0);
  const totalPerda = d.perdasPorEtapa.reduce((a, p) => a + p.perda, 0);

  // Simulação
  const forno = d.fornos.find((f) => f.id === fornoId);
  const cap = forno ? Number(forno.capacidadePadrao) || 0 : 0;
  const ch = Number(cicloH) || 0;
  const hd = Number(horasDia) || 0;
  const hz = Number(horizonte) || 0;
  const ciclos = cap > 0 ? Math.ceil(d.demandaTotalMilheiros / cap) : 0;
  const fornoHoras = ciclos * ch;
  const diasForno = hd > 0 ? fornoHoras / hd : 0;
  const dispHoras = hz * hd;
  const ocupacao = dispHoras > 0 ? (fornoHoras / dispHoras) * 100 : 0;
  const cabe = dispHoras > 0 && fornoHoras <= dispHoras;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Dashboard do PCP"
        subtitle="Indicadores de produção: perdas, biomassa, WIP por estágio, necessidades e capacidade do forno."
        breadcrumbs={[{ label: "PCP" }, { label: "Dashboard" }]}
        action={<button onClick={load} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted"><RefreshCw className="w-4 h-4" /> Atualizar</button>}
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-8 space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="Ordens abertas" value={String(opAbertas)} sub={`${d.ordens.CONCLUIDA ?? 0} concluídas`} icon={Factory} color="bg-cyan-50 text-cyan-600" />
          <Kpi label="Perda total" value={String(Math.round(totalPerda))} sub="soma das etapas" icon={AlertTriangle} color="bg-danger/10 text-danger" />
          <Kpi label="Biomassa/milheiro" value={d.biomassa.porMilheiro != null ? `${d.biomassa.porMilheiro} kg` : "—"} sub={`${Math.round(d.biomassa.kg)} kg total`} icon={Flame} color="bg-warning/10 text-warning" />
          <Kpi label="A comprar (MRP)" value={String(Math.round(d.mrp.totalAComprar))} sub={`${d.mrp.porCategoria.length} categoria(s)`} icon={ShoppingCart} color="bg-info/10 text-info" />
          <Kpi label="Demanda planejada" value={`${d.demandaTotalMilheiros}`} sub="milheiros (MPS)" icon={Layers} color="bg-violet-50 text-violet-600" />
        </div>

        {/* Produção por estágio */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {ESTADO.map((e) => (
            <div key={e.k} className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Produzido — {e.l}</p>
              <p className="text-xl font-semibold text-foreground mt-0.5">{Math.round(d.producaoPorEstado[e.k] ?? 0)}</p>
              <span className={cn("inline-block mt-1 rounded px-1.5 py-0.5 text-[10px] font-medium", e.c)}>{e.l}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Perdas por etapa */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">Perdas por etapa</h3>
            {d.perdasPorEtapa.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">Sem perdas registradas ainda.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={d.perdasPorEtapa} margin={{ left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="nome" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="perda" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Simulação de capacidade do forno (gargalo) */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5"><Gauge className="w-4 h-4 text-cyan-500" /> Simulação de capacidade do forno</h3>
            {d.fornos.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4">Cadastre um centro de trabalho do tipo <strong>Forno</strong> (com capacidade/ciclo) para simular.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <label className="block text-[11px] text-muted-foreground mb-0.5">Forno</label>
                    <ComboboxWithCreate
                      value={fornoId}
                      onChange={(v) => setFornoId(v)}
                      allowNone={false}
                      triggerClassName="h-8 rounded text-sm"
                      options={d.fornos.map((f) => ({ value: f.id, label: `${f.nome} (${Number(f.capacidadePadrao) || 0} ${f.unidadeCapacidade ?? "/ciclo"})` }))}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <div><label className="block text-[11px] text-muted-foreground mb-0.5">Ciclo (h)</label><input className="w-full rounded border border-border px-2 py-1 text-sm text-right" inputMode="decimal" value={cicloH} onChange={(e) => setCicloH(e.target.value)} /></div>
                    <div><label className="block text-[11px] text-muted-foreground mb-0.5">h/dia</label><input className="w-full rounded border border-border px-2 py-1 text-sm text-right" inputMode="decimal" value={horasDia} onChange={(e) => setHorasDia(e.target.value)} /></div>
                    <div><label className="block text-[11px] text-muted-foreground mb-0.5">Dias</label><input className="w-full rounded border border-border px-2 py-1 text-sm text-right" inputMode="decimal" value={horizonte} onChange={(e) => setHorizonte(e.target.value)} /></div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-muted p-2"><p className="text-[11px] text-muted-foreground">Demanda</p><p className="font-semibold text-foreground">{d.demandaTotalMilheiros} milheiros</p></div>
                  <div className="rounded-lg bg-muted p-2"><p className="text-[11px] text-muted-foreground">Ciclos de forno</p><p className="font-semibold text-foreground">{ciclos}</p></div>
                  <div className="rounded-lg bg-muted p-2"><p className="text-[11px] text-muted-foreground">Horas de forno</p><p className="font-semibold text-foreground">{fornoHoras} h (~{diasForno.toFixed(1)} dias)</p></div>
                  <div className={cn("rounded-lg p-2", cabe ? "bg-success/10" : "bg-danger/10")}>
                    <p className="text-[11px] text-muted-foreground">Ocupação no horizonte</p>
                    <p className={cn("font-semibold", cabe ? "text-success" : "text-danger")}>{ocupacao.toFixed(0)}% {cabe ? "✓ cabe" : "✗ não cabe"}</p>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">Estimativa de capacidade (RCCP) no gargalo: ciclos = demanda ÷ capacidade; ocupação = horas de forno ÷ (dias × h/dia).</p>
              </>
            )}
          </div>
        </div>

        {/* Fila por centro */}
        {d.filaPorCentro.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">Fila por centro de trabalho</h3>
            <div className="flex flex-wrap gap-2">
              {d.filaPorCentro.map((f) => (
                <span key={f.centro} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm text-foreground">
                  {f.centro} <span className="font-semibold text-cyan-700">{f.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
