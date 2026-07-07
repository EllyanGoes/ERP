"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useTabTitle } from "@/lib/tabs-context";
import { ArrowLeft, Loader2 } from "lucide-react";

// Leaflet depende de `window` — carrega só no cliente.
const ConcorrentesMap = dynamic(() => import("@/components/marketing/ConcorrentesMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
  ),
});

export default function GeomarketingPage() {
  useTabTitle("Geomarketing");

  return (
    <div className="flex flex-col h-[calc(100vh-var(--tabbar-h,0px))]">
      <PageHeader
        title="Geomarketing"
        subtitle="Mapa de localização dos competidores"
        breadcrumbs={[
          { label: "Marketing" },
          { label: "Inteligência Comercial", href: "/marketing/inteligencia-comercial" },
          { label: "Geomarketing" },
        ]}
        actions={
          <Link href="/marketing/inteligencia-comercial">
            <Button variant="outline" className="gap-2"><ArrowLeft className="h-4 w-4" /> Voltar à lista</Button>
          </Link>
        }
      />
      <div className="flex-1 px-8 pb-8 min-h-[480px]">
        <div className="h-full min-h-[480px] rounded-xl border border-border overflow-hidden">
          <ConcorrentesMap />
        </div>
      </div>
    </div>
  );
}
