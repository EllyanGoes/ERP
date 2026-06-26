"use client";

import dynamic from "next/dynamic";
import { useTabTitle } from "@/lib/tabs-context";
import { RefreshCw } from "lucide-react";

// React Flow é pesado e usa window — carrega só no cliente.
const ChaoView = dynamic(() => import("@/components/pcp/chao/ChaoView"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-muted-foreground gap-2 text-sm">
      <RefreshCw className="w-4 h-4 animate-spin" /> Carregando fluxo de trabalho…
    </div>
  ),
});

export default function ChaoPage() {
  useTabTitle("Fluxo de Trabalho");
  return (
    <div className="h-[calc(100vh-3.5rem)]">
      <ChaoView />
    </div>
  );
}
