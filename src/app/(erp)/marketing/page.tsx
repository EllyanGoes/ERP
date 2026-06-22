"use client";

import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import { Megaphone } from "lucide-react";

export default function MarketingPage() {
  useTabTitle("Marketing");

  return (
    <div>
      <PageHeader
        title="Marketing"
        subtitle="Painel do módulo de Marketing"
      />

      <div className="px-8 pb-8">
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Megaphone className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">Módulo de Marketing</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Este módulo está disponível. Em breve traremos campanhas, leads e
            indicadores de marketing por aqui.
          </p>
        </div>
      </div>
    </div>
  );
}
