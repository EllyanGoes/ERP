"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";
import { Factory, RefreshCw, ChevronRight, Boxes } from "lucide-react";

interface FilaEtapa {
  id: string;
  nome: string;
  sequencia: number;
  status: string;
  centroTrabalho: string;
  estadoSaida: string | null;
  tempoCicloHoras: string | number | null;
  ordemId: string;
  numero: string;
  produto: string | null;
  quantidade: string | number;
  unidade: string | null;
}

const ETAPA_STATUS: Record<string, string> = {
  PENDENTE: "bg-muted text-muted-foreground",
  EM_EXECUCAO: "bg-warning/15 text-warning",
};
const ESTADO_LABEL: Record<string, string> = { UMIDO: "úmido", SECO: "seco", QUEIMADO: "queimado", ACABADO: "acabado" };

export default function OperacoesPage() {
  useTabTitle("Operações (fila)");
  const router = useRouter();
  const [etapas, setEtapas] = useState<FilaEtapa[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const r = await fetch("/api/pcp/operacoes");
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao carregar");
      setEtapas(j.data ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Agrupa por centro de trabalho
  const grupos = Array.from(
    etapas.reduce((map, e) => {
      const arr = map.get(e.centroTrabalho) ?? [];
      arr.push(e);
      map.set(e.centroTrabalho, arr);
      return map;
    }, new Map<string, FilaEtapa[]>()),
  );

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Operações (fila de produção)"
        subtitle="Etapas a executar agrupadas por centro de trabalho. Cada operação vê o que produzir e aponta na ordem."
        breadcrumbs={[{ label: "PCP" }, { label: "Operações" }]}
        action={
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> Atualizar
          </button>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-8">
        {erro && <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</div>}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm"><RefreshCw className="w-4 h-4 animate-spin" /> Carregando…</div>
        ) : etapas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-cyan-50 flex items-center justify-center mb-3"><Factory className="w-7 h-7 text-cyan-400" /></div>
            <p className="text-sm font-medium text-foreground">Nenhuma etapa na fila</p>
            <p className="text-xs text-muted-foreground mt-1">Libere ordens de produção para que as etapas apareçam aqui por centro de trabalho.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {grupos.map(([centro, lista]) => (
              <div key={centro}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex w-7 h-7 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600"><Boxes className="w-4 h-4" /></span>
                  <h3 className="text-sm font-semibold text-foreground">{centro}</h3>
                  <span className="text-xs text-muted-foreground">{lista.length} etapa(s)</span>
                </div>
                <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
                  {lista.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => router.push(`/pcp/ordens/${e.ordemId}`)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-cyan-50/40 text-left"
                    >
                      <span className="font-mono text-xs text-muted-foreground w-24 shrink-0">{e.numero}</span>
                      <span className="flex-1 min-w-0">
                        <span className="text-sm text-foreground">{e.nome}</span>
                        {e.produto && <span className="text-xs text-muted-foreground"> · {e.produto}</span>}
                        <span className="text-xs text-muted-foreground"> · {Number(e.quantidade)} {e.unidade}</span>
                        {e.estadoSaida && <span className="text-xs text-muted-foreground"> · → {ESTADO_LABEL[e.estadoSaida] ?? e.estadoSaida}</span>}
                        {e.tempoCicloHoras ? <span className="text-xs text-muted-foreground"> · {Number(e.tempoCicloHoras)}h</span> : null}
                      </span>
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0", ETAPA_STATUS[e.status])}>
                        {e.status === "EM_EXECUCAO" ? "em execução" : "pendente"}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/60 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
