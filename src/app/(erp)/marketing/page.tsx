"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import { formatBRL } from "@/lib/utils";
import {
  Target,
  Map as MapIcon,
  ChevronRight,
  Filter,
  Megaphone,
  UserPlus,
  Loader2,
  TrendingUp,
  Trophy,
  Banknote,
  Globe,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const CARDS = [
  {
    href: "/marketing/funis",
    icon: Filter,
    title: "Funis de Marketing",
    desc: "Desenhe a jornada de aquisição no canvas (fontes, páginas, ações, etapas) e acompanhe os números reais de cada nó.",
  },
  {
    href: "/marketing/campanhas",
    icon: Megaphone,
    title: "Campanhas",
    desc: "Cadastre campanhas por plataforma (Meta, Google, TikTok, orgânico...) com UTMs para atribuição de leads e tráfego.",
  },
  {
    href: "/marketing/leads",
    icon: UserPlus,
    title: "Leads",
    desc: "Gerencie oportunidades no kanban de etapas, registre a timeline e converta leads em clientes do ERP.",
  },
  {
    href: "/marketing/inteligencia-comercial",
    icon: Target,
    title: "Inteligência Comercial (IC)",
    desc: "Cadastre concorrentes de mercado, categorize (fornecedor/revendedor), registre endereço e mapeie os preços praticados por produto.",
  },
  {
    href: "/marketing/inteligencia-comercial/mapa",
    icon: MapIcon,
    title: "Geomarketing",
    desc: "Visualize a localização dos concorrentes no mapa.",
  },
];

// ── Tipos do /api/marketing/painel ───────────────────────────────────────────
type SerieDia = { data: string; total: number };
type Painel = {
  leadsNovos: SerieDia[];
  leadsPorEtapa: { etapa: string; cor: string | null; total: number }[];
  leadsPorCampanha: { campanha: string; total: number }[];
  conversao: { abertos: number; ganhos: number; perdidos: number; taxaGanho: number };
  receitaConvertida: number;
  visitasPorDia: SerieDia[];
};

const DIAS_PAINEL = 30;
// Paleta das barras de campanha (mesma família dos demais relatórios).
const BAR_COLORS = [
  "#d946ef", "#3b82f6", "#f59e0b", "#10b981",
  "#8b5cf6", "#ef4444", "#06b6d4", "#f97316",
];

function diaLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

// Tooltip padrão dos dashboards (bg-card p/ funcionar no modo dark).
function ChartTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-sm text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-muted-foreground">
          {p.name}: <span className="font-bold text-foreground">{formatter ? formatter(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4 text-fuchsia-500 dark:text-fuchsia-400" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground mb-3">{title}</h3>
      {children}
    </div>
  );
}

function PainelMarketing() {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ativo = true;
    fetch(`/api/marketing/painel?dias=${DIAS_PAINEL}`)
      .then((r) => r.json())
      .then((json) => {
        if (ativo) setPainel(json.data ?? null);
      })
      .catch(() => {
        if (ativo) setPainel(null);
      })
      .finally(() => {
        if (ativo) setLoading(false);
      });
    return () => {
      ativo = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Carregando painel...</span>
      </div>
    );
  }
  if (!painel) return null;

  const visitas30d = painel.visitasPorDia.reduce((s, d) => s + d.total, 0);
  const leadsNovos = painel.leadsNovos.map((d) => ({ ...d, label: diaLabel(d.data) }));
  const visitasPorDia = painel.visitasPorDia.map((d) => ({ ...d, label: diaLabel(d.data) }));
  const tickStyle = { fontSize: 11, fill: "#94a3b8" };

  return (
    <div className="px-8 pb-8 space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Últimos {DIAS_PAINEL} dias
      </h2>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={UserPlus} label="Leads abertos" value={String(painel.conversao.abertos)} hint="pipeline atual" />
        <KpiCard
          icon={Trophy}
          label="Taxa de ganho"
          value={`${(painel.conversao.taxaGanho * 100).toFixed(0)}%`}
          hint={`${painel.conversao.ganhos} ganhos · ${painel.conversao.perdidos} perdidos`}
        />
        <KpiCard icon={Banknote} label="Receita convertida" value={formatBRL(painel.receitaConvertida)} hint="valor estimado dos leads ganhos" />
        <KpiCard icon={Globe} label={`Visitas ${DIAS_PAINEL}d`} value={visitas30d.toLocaleString("pt-BR")} hint="tracking dos funis ativos" />
      </div>

      {/* Séries diárias */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Leads novos por dia">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={leadsNovos} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
              <XAxis dataKey="label" tick={tickStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
              <YAxis tick={tickStyle} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="total" name="Leads" stroke="#d946ef" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Visitas por dia (tracking)">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={visitasPorDia} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
              <XAxis dataKey="label" tick={tickStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
              <YAxis tick={tickStyle} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="total" name="Visitas" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Leads abertos por etapa">
          {painel.leadsPorEtapa.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum lead no pipeline.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, painel.leadsPorEtapa.length * 36)}>
              <BarChart data={painel.leadsPorEtapa} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} horizontal={false} />
                <XAxis type="number" tick={tickStyle} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="etapa" tick={tickStyle} axisLine={false} tickLine={false} width={110} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#94a3b8", fillOpacity: 0.08 }} />
                <Bar dataKey="total" name="Leads" radius={[0, 4, 4, 0]} barSize={18}>
                  {painel.leadsPorEtapa.map((e, i) => (
                    <Cell key={i} fill={e.cor || "#d946ef"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Leads por campanha (top 8)">
          {painel.leadsPorCampanha.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum lead no período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, painel.leadsPorCampanha.length * 36)}>
              <BarChart data={painel.leadsPorCampanha} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} horizontal={false} />
                <XAxis type="number" tick={tickStyle} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="campanha" tick={tickStyle} axisLine={false} tickLine={false} width={130} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#94a3b8", fillOpacity: 0.08 }} />
                <Bar dataKey="total" name="Leads" radius={[0, 4, 4, 0]} barSize={18}>
                  {painel.leadsPorCampanha.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

export default function MarketingPage() {
  useTabTitle("Marketing");

  return (
    <div>
      <PageHeader title="Marketing" subtitle="Painel do módulo de Marketing" />

      <div className="px-8 pb-8 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="group flex items-start gap-4 rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-fuchsia-300 hover:bg-muted/40"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-400">
              <c.icon className="h-5 w-5" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <h3 className="font-semibold text-foreground">{c.title}</h3>
                <ChevronRight className="h-4 w-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="text-sm text-muted-foreground mt-1">{c.desc}</p>
            </div>
          </Link>
        ))}
      </div>

      <PainelMarketing />
    </div>
  );
}
