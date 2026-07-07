"use client";

import Link from "next/link";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import { Target, Map as MapIcon, ChevronRight, Filter, Megaphone, UserPlus } from "lucide-react";

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
    </div>
  );
}
