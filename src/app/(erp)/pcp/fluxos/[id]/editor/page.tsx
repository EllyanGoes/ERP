"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTabTitle } from "@/lib/tabs-context";
import { RefreshCw, AlertTriangle } from "lucide-react";
import type { FluxoEditorData } from "@/components/pcp/editor/FluxoEditor";

// O editor (React Flow) é pesado e usa window — carrega só no cliente.
const FluxoEditor = dynamic(() => import("@/components/pcp/editor/FluxoEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-muted-foreground gap-2 text-sm">
      <RefreshCw className="w-4 h-4 animate-spin" /> Carregando editor…
    </div>
  ),
});

export default function EditorPage() {
  const params = useParams();
  const id = (params?.id as string) ?? "";
  const [fluxo, setFluxo] = useState<FluxoEditorData | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useTabTitle("Editor de Fluxo");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/pcp/fluxos/${id}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.data) setFluxo(j.data as FluxoEditorData);
        else setErro(j.error ?? "Fluxo não encontrado");
      })
      .catch(() => setErro("Erro ao carregar o fluxo"));
  }, [id]);

  if (erro) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-2">
        <AlertTriangle className="w-7 h-7 text-amber-400" />
        <p className="text-sm text-muted-foreground">{erro}</p>
      </div>
    );
  }
  if (!fluxo) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground gap-2 text-sm">
        <RefreshCw className="w-4 h-4 animate-spin" /> Carregando…
      </div>
    );
  }
  return <FluxoEditor fluxo={fluxo} />;
}
