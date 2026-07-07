"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTabTitle } from "@/lib/tabs-context";
import { RefreshCw, AlertTriangle } from "lucide-react";
import type { FunilDetalhe } from "@/components/marketing/funil/types";

// O canvas (React Flow) é pesado e usa window — carrega só no cliente.
const FunilCanvas = dynamic(() => import("@/components/marketing/funil/FunilCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-muted-foreground gap-2 text-sm">
      <RefreshCw className="w-4 h-4 animate-spin" /> Carregando editor…
    </div>
  ),
});

export default function FunilEditorPage() {
  const params = useParams();
  const id = (params?.id as string) ?? "";
  const [funil, setFunil] = useState<FunilDetalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useTabTitle(funil?.nome ?? "Funil de Marketing");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/marketing/funis/${id}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.data) setFunil(j.data as FunilDetalhe);
        else setErro(j.error ?? "Funil não encontrado");
      })
      .catch(() => setErro("Erro ao carregar o funil"));
  }, [id]);

  if (erro) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-2">
        <AlertTriangle className="w-7 h-7 text-amber-400" />
        <p className="text-sm text-muted-foreground">{erro}</p>
      </div>
    );
  }
  if (!funil) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground gap-2 text-sm">
        <RefreshCw className="w-4 h-4 animate-spin" /> Carregando…
      </div>
    );
  }
  return <FunilCanvas funil={funil} />;
}
