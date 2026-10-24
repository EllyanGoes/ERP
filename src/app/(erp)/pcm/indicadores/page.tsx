"use client";

// Indicadores de confiabilidade da Manutenção (docs/manutencao-prd.md §14):
// MTBF, MTTR, Disponibilidade e Confiabilidade R(t) por ativo e no total, com a
// tendência dos 12 meses. Substitui as telas do Ativo Saúde (MTBF/MTTR,
// Fechamento mensal, Falhas por tipo): tudo direto das OS validadas pelo PCM.
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { AlertTriangle, Loader2, Info } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import DateRangePicker from "@/components/shared/DateRangePicker";
import SelectMenu from "@/components/shared/SelectMenu";
import DataTable from "@/components/shared/DataTable";
import CriticidadeBadge from "@/components/pcm/CriticidadeBadge";
import { Label } from "@/components/ui/label";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { useRelatorioCache } from "@/lib/use-relatorio-cache";
import { cn } from "@/lib/utils";
import { AtivoCombobox, useManutLookups } from "@/components/manutencao/comum";
import type { IndicadoresResponse, IndicadorAtivo, PontoTendencia } from "@/lib/manutencao/confiabilidade";

const iso = (d: Date) => d.toLocaleDateString("sv-SE");
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
/** Horas: inteiro acima de 100 h, uma casa abaixo; "—" sem valor. */
const fmtHrs = (h: number | null | undefined) => (h == null ? "—" : h >= 100 ? `${Math.round(h).toLocaleString("pt-BR")} h` : `${num.format(h)} h`);
/** Percentual; acima de 99,9% mostra 2 casas para não virar "100%" com parada no período. */
const fmtPct = (v: number | null | undefined, casas = 1) => (v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: v >= 0.999 && v < 1 ? 2 : casas })}%`);

// Cores categóricas validadas no projeto (uma série por gráfico — a cor segue a medida).
const COR = { falhas: "#d97706", parada: "#d97706", mtbf: "#3b82f6", disponibilidade: "#0d9488" };
const OPCOES_CRIT = [{ value: "", label: "Todas as criticidades" }, { value: "A", label: "Criticidade A" }, { value: "B", label: "Criticidade B" }, { value: "C", label: "Criticidade C" }];
const OPCOES_HORIZONTE = [7, 15, 30, 60, 90, 180, 365].map((d) => ({ value: String(d), label: `${d} dias` }));
const PRESETS = [
  { label: "30 dias", dias: 30 }, { label: "90 dias", dias: 90 }, { label: "12 meses", dias: 365 },
];

/** Tom do valor conforme a faixa (pior = vermelho). */
const tomDisp = (v: number | null) => (v == null ? "" : v < 0.9 ? "text-danger" : v < 0.97 ? "text-warning" : "text-success");
const tomConf = (v: number | null) => (v == null ? "" : v < 0.5 ? "text-danger" : v < 0.8 ? "text-warning" : "text-success");

export default function IndicadoresPage() {
  useTabTitle("Indicadores de confiabilidade");
  // useSearchParams exige Suspense numa rota estática.
  return <Suspense fallback={<div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}><Indicadores /></Suspense>;
}

function Indicadores() {
  const router = useRouter();
  const sp = useSearchParams();
  const hoje = new Date();
  const [periodo, setPeriodo] = usePersistedState("pcm:indicadores:periodo", { from: iso(new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1)), to: iso(hoje) });
  const [crit, setCrit] = usePersistedState("pcm:indicadores:crit", "");
  const [horizonte, setHorizonte] = usePersistedState("pcm:indicadores:horizonte", "30");
  const [ativoId, setAtivoId] = useState(sp.get("ativoId") ?? "");
  const [mostrarSemFalha, setMostrarSemFalha] = usePersistedState("pcm:indicadores:sem-falha", false);
  const lk = useManutLookups();
  // ?criticidade=A (link do Painel) sobrepõe o filtro persistido ao abrir.
  const critUrl = sp.get("criticidade");
  useEffect(() => { if (critUrl === "A" || critUrl === "B" || critUrl === "C") setCrit(critUrl); }, [critUrl, setCrit]);

  const params = new URLSearchParams({ de: periodo.from, ate: periodo.to, horizonteDias: horizonte });
  if (crit) params.set("criticidade", crit);
  if (ativoId) params.set("ativoId", ativoId);
  const { data, loading, erro } = useRelatorioCache<{ data: IndicadoresResponse }>(`/api/pcm/indicadores?${params.toString()}`);
  const d = data?.data;

  // Os 3 piores (com falha) ganham destaque na tabela.
  const piores = useMemo(() => new Set((d?.porAtivo ?? []).filter((a) => a.falhas > 0).slice(0, 3).map((a) => a.ativoId)), [d]);
  const linhas = useMemo(() => (d?.porAtivo ?? []).filter((a) => mostrarSemFalha || a.falhas > 0 || ativoId), [d, mostrarSemFalha, ativoId]);

  const colunas: ColumnDef<IndicadorAtivo>[] = [
    { id: "tag", header: "Tag", accessorKey: "tag", cell: ({ row }) => <span className="font-mono text-xs whitespace-nowrap inline-flex items-center gap-1.5">{piores.has(row.original.ativoId) && <AlertTriangle className="w-3.5 h-3.5 text-danger" />}{row.original.tag}</span> },
    { id: "nome", header: "Ativo", accessorKey: "nome", cell: ({ row }) => <span className="block max-w-[22rem] truncate" title={row.original.nome}>{row.original.nome}</span> },
    { id: "crit", header: "Crit.", accessorFn: (r) => r.criticidade ?? "Z", cell: ({ row }) => (row.original.criticidade ? <CriticidadeBadge value={row.original.criticidade} /> : <span className="text-muted-foreground/50">—</span>), meta: { className: "text-center w-14" } },
    { id: "falhas", header: "Falhas", accessorKey: "falhas", cell: ({ row }) => <span className={cn("tabular-nums", row.original.falhas > 0 && "font-medium")}>{row.original.falhas}{row.original.falhasSemParada > 0 && <span className="text-warning" title={`${row.original.falhasSemParada} sem carimbo de parada (0 h)`}>*</span>}</span>, meta: { sortTipo: "numero", className: "text-right" } },
    { id: "parada", header: "Parada", accessorKey: "horasParada", cell: ({ row }) => <span className="tabular-nums">{fmtHrs(row.original.horasParada)}</span>, meta: { sortTipo: "numero", className: "text-right" } },
    { id: "mtbf", header: "MTBF", accessorFn: (r) => r.mtbf ?? Number.MAX_SAFE_INTEGER, cell: ({ row }) => <span className="tabular-nums">{fmtHrs(row.original.mtbf)}</span>, meta: { sortTipo: "numero", className: "text-right" } },
    { id: "mttr", header: "MTTR", accessorFn: (r) => r.mttr ?? -1, cell: ({ row }) => <span className="tabular-nums">{fmtHrs(row.original.mttr)}</span>, meta: { sortTipo: "numero", className: "text-right" } },
    { id: "disp", header: "Disponib.", accessorFn: (r) => r.disponibilidade ?? 1, cell: ({ row }) => <span className={cn("tabular-nums font-medium", tomDisp(row.original.disponibilidade))}>{fmtPct(row.original.disponibilidade)}</span>, meta: { sortTipo: "numero", className: "text-right" } },
    { id: "conf", header: `Confiab. ${horizonte} d`, accessorFn: (r) => r.confiabilidade ?? 1, cell: ({ row }) => (row.original.confiabilidade == null ? <span className="text-muted-foreground text-xs">sem falhas</span> : <span className={cn("tabular-nums font-medium", tomConf(row.original.confiabilidade))}>{fmtPct(row.original.confiabilidade, 0)}</span>), meta: { sortTipo: "numero", className: "text-right" } },
  ];

  return (
    <div>
      <PageHeader
        title="Indicadores de confiabilidade"
        subtitle="MTBF, MTTR, disponibilidade e confiabilidade calculados das OS validadas pelo PCM"
        breadcrumbs={[{ label: "Manutenção", href: "/pcm" }, { label: "Indicadores" }]}
      />
      <div className="px-8 pb-10 space-y-4">
        {/* Filtros */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Período</Label>
            <div className="flex items-center gap-1">
              <DateRangePicker value={periodo} onChange={(r) => r.from && r.to && setPeriodo({ from: r.from, to: r.to })} />
              {PRESETS.map((p) => (
                <button key={p.label} onClick={() => setPeriodo({ from: iso(new Date(Date.now() - p.dias * 86_400_000)), to: iso(new Date()) })} className="text-xs px-2 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted">{p.label}</button>
              ))}
            </div>
          </div>
          <div><Label className="text-xs">Criticidade</Label><SelectMenu value={crit} options={OPCOES_CRIT} onChange={setCrit} className="w-48" /></div>
          <div className="min-w-[18rem]"><Label className="text-xs">Ativo</Label><AtivoCombobox ativos={lk.ativos.filter((a) => a.tipo !== "LOCAL")} value={ativoId} onChange={setAtivoId} placeholder="Todos os ativos" allowNone /></div>
          <div><Label className="text-xs">Horizonte R(t)</Label><SelectMenu value={horizonte} options={OPCOES_HORIZONTE} onChange={setHorizonte} className="w-32" /></div>
        </div>

        {erro && <p className="text-sm text-danger">{erro}</p>}
        {loading && !d && <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}
        {d && <>
          {/* Números grandes com contexto */}
          <div className={cn("grid grid-cols-2 xl:grid-cols-4 gap-3", loading && "opacity-60")}>
            <Card titulo="MTBF" valor={fmtHrs(d.total.mtbf)} nota={d.total.falhas ? `${d.total.falhas} falha(s) em ${d.periodo.dias} dias · ${d.total.ativos} ativo(s)` : `Nenhuma falha em ${d.periodo.dias} dias · ${d.total.ativos} ativo(s)`} ajuda="Tempo médio entre falhas = (funcionamento − parada) ÷ nº de falhas." />
            <Card titulo="MTTR" valor={fmtHrs(d.total.mttr)} nota={`${fmtHrs(d.total.horasParada)} de parada no total${d.total.falhasSemParada ? ` · ${d.total.falhasSemParada} falha(s) sem carimbo de parada` : ""}`} ajuda="Tempo médio para reparo = horas de parada ÷ nº de falhas. Só conta a janela máquina parada da OS." alerta={d.total.falhasSemParada > 0} />
            <Card titulo="Disponibilidade" valor={fmtPct(d.total.disponibilidade)} tom={tomDisp(d.total.disponibilidade)} nota={`${fmtHrs(d.total.horasFuncionamento)} previstas − ${fmtHrs(d.total.horasParada)} paradas`} ajuda="(funcionamento − parada) ÷ funcionamento. Funcionamento = dias × horas/dia do ativo (herdado do pai; padrão 24 h)." />
            <Card titulo={`Confiabilidade ${d.horizonteDias} dias`} valor={d.total.confiabilidade == null ? "—" : fmtPct(d.total.confiabilidade, 0)} tom={tomConf(d.total.confiabilidade)} nota={d.total.confiabilidade == null ? "Sem falhas no período: MTBF indefinido" : `Chance de passar ${d.horizonteDias} dias sem falha, mantido o MTBF atual`} ajuda="R(t) = e^(−t ÷ MTBF), com t = horizonte em horas." />
          </div>

          {/* Tendência: pequenos múltiplos, uma medida (e um eixo) por gráfico */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">Tendência — 12 meses até {new Date(periodo.to + "T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h3>
              <p className="text-xs text-muted-foreground">Mês corrente conta só os dias já corridos.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mt-3">
              <Mini titulo="Falhas" serie={d.tendencia} chave="falhas" cor={COR.falhas} tipo="barra" fmt={(v) => String(v)} />
              <Mini titulo="Horas de parada" serie={d.tendencia} chave="horasParada" cor={COR.parada} tipo="barra" fmt={(v) => fmtHrs(v)} />
              <Mini titulo="MTBF (h)" serie={d.tendencia} chave="mtbf" cor={COR.mtbf} tipo="linha" fmt={(v) => fmtHrs(v)} />
              <Mini titulo="Disponibilidade" serie={d.tendencia} chave="disponibilidade" cor={COR.disponibilidade} tipo="linha" fmt={(v) => fmtPct(v)} dominio={[(min: number) => Math.max(0, Math.floor(min * 20) / 20 - 0.05), 1]} />
            </div>
          </div>

          {/* Por ativo */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Por ativo <span className="text-muted-foreground font-normal">· piores primeiro · clique abre o ativo</span></h3>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input type="checkbox" className="accent-[hsl(var(--info))]" checked={mostrarSemFalha} onChange={(e) => setMostrarSemFalha(e.target.checked)} />
                Mostrar ativos sem falha ({(d.porAtivo.length - d.porAtivo.filter((a) => a.falhas > 0).length)})
              </label>
            </div>
            <DataTable
              data={linhas}
              columns={colunas}
              itemLabel="ativo"
              searchPlaceholder="Buscar tag ou nome…"
              onRowClick={(r) => router.push(`/pcm/ativos?ativo=${r.codApl}`)}
              getRowId={(r) => r.ativoId}
            />
            {d.total.falhasSemParada > 0 && <p className="text-[11px] text-muted-foreground">* falhas sem carimbo de parada (início/fim de máquina parada na OS) entram com 0 h e puxam o MTTR para baixo — revise a OS.</p>}
          </div>
        </>}
      </div>
    </div>
  );
}

function Card({ titulo, valor, nota, ajuda, tom, alerta }: { titulo: string; valor: string; nota: string; ajuda: string; tom?: string; alerta?: boolean }) {
  return (
    <div className={cn("bg-card border rounded-xl p-4", alerta ? "border-warning/40" : "border-border")}>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">{titulo}<span title={ajuda} className="cursor-help"><Info className="w-3 h-3" /></span></div>
      <div className={cn("text-3xl font-semibold tabular-nums mt-1", tom)}>{valor}</div>
      <p className="text-[11px] text-muted-foreground mt-0.5">{nota}</p>
    </div>
  );
}

const eixo = { fontSize: 10, fill: "hsl(var(--muted-foreground))" };
const tooltipStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12, borderRadius: 8 };

function Mini({ titulo, serie, chave, cor, tipo, fmt, dominio }: { titulo: string; serie: PontoTendencia[]; chave: keyof PontoTendencia; cor: string; tipo: "barra" | "linha"; fmt: (v: number) => string; dominio?: [((min: number) => number) | number, number] }) {
  const ultimo = serie[serie.length - 1]?.[chave] as number | null | undefined;
  return (
    <div>
      <div className="flex items-baseline justify-between"><p className="text-xs font-medium">{titulo}</p><p className="text-xs text-muted-foreground tabular-nums">{ultimo == null ? "—" : fmt(ultimo)}</p></div>
      <div className="h-32 mt-1">
        <ResponsiveContainer width="100%" height="100%">
          {tipo === "barra" ? (
            <BarChart data={serie} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={eixo} stroke="hsl(var(--border))" interval={2} />
              <YAxis tick={eixo} stroke="hsl(var(--border))" allowDecimals={false} />
              <Tooltip formatter={(v) => fmt(Number(v))} contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
              <Bar dataKey={chave} name={titulo} fill={cor} radius={[3, 3, 0, 0]} />
            </BarChart>
          ) : (
            <LineChart data={serie} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={eixo} stroke="hsl(var(--border))" interval={2} />
              <YAxis tick={eixo} stroke="hsl(var(--border))" domain={dominio} tickFormatter={(v: number) => (chave === "disponibilidade" ? `${Math.round(v * 100)}%` : String(v))} />
              <Tooltip formatter={(v) => fmt(Number(v))} contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey={chave} name={titulo} stroke={cor} strokeWidth={2} dot={{ r: 3, fill: cor, stroke: "hsl(var(--card))", strokeWidth: 2 }} connectNulls={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
