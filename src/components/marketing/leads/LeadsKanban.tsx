"use client";

import { useState, useEffect, useCallback } from "react";
import { cn, formatBRL } from "@/lib/utils";
import { PLATAFORMA_BADGE } from "@/components/marketing/CampanhaForm";
import { tempoRelativo } from "@/components/marketing/leads/LeadTimeline";
import { Loader2, Trophy, Building2, Clock } from "lucide-react";

type Etapa = { id: string; nome: string; ordem: number; cor: string | null; ganho: boolean };

export type LeadKanban = {
  id: string;
  nome: string;
  empresaNome: string | null;
  valorEstimado: number | string | null;
  status: "ABERTO" | "GANHO" | "PERDIDO";
  etapaId: string | null;
  createdAt: string;
  campanha: { id: string; nome: string; plataforma: string } | null;
};

export default function LeadsKanban({
  q,
  campanhaId,
  reloadKey,
  onOpenLead,
}: {
  q: string;
  campanhaId: string;
  /** Incremente para forçar a recarga (ex.: após mudanças no drawer/criação). */
  reloadKey: number;
  onOpenLead: (id: string) => void;
}) {
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [leads, setLeads] = useState<LeadKanban[]>([]);
  const [loading, setLoading] = useState(true);
  const [overCol, setOverCol] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/marketing/etapas-lead")
      .then((r) => r.json())
      .then((j) => setEtapas(j.data ?? []))
      .catch(() => {});
  }, []);

  const carregar = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (campanhaId) params.set("campanhaId", campanhaId);
    params.set("limit", "500");
    const res = await fetch(`/api/marketing/leads?${params.toString()}`);
    const json = await res.json();
    // O kanban mostra abertos (+ ganhos na coluna de ganho); perdidos ficam na tabela
    setLeads(((json.data ?? []) as LeadKanban[]).filter((l) => l.status !== "PERDIDO"));
    setLoading(false);
  }, [q, campanhaId]);

  useEffect(() => {
    const t = setTimeout(carregar, 250);
    return () => clearTimeout(t);
  }, [carregar, reloadKey]);

  const primeiraEtapaId = etapas[0]?.id;

  function leadsDaColuna(etapa: Etapa): LeadKanban[] {
    return leads.filter((l) => {
      if (l.status === "GANHO") return etapa.ganho;
      // Leads sem etapa entram na primeira coluna
      const etapaLead = l.etapaId ?? primeiraEtapaId;
      return etapaLead === etapa.id;
    });
  }

  async function mover(leadId: string, etapaId: string) {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.etapaId === etapaId || lead.status !== "ABERTO") return;
    const antes = leads;
    // Atualização otimista — reverte se o PATCH falhar
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, etapaId } : l)));
    try {
      const res = await fetch(`/api/marketing/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapaId }),
      });
      if (!res.ok) setLeads(antes);
      else carregar(); // sincroniza status/etapa que o servidor possa ter ajustado
    } catch {
      setLeads(antes);
    }
  }

  if (loading && leads.length === 0 && etapas.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 items-start">
      {etapas.map((etapa) => {
        const itens = leadsDaColuna(etapa);
        const soma = itens.reduce((acc, l) => acc + (Number(l.valorEstimado) || 0), 0);
        return (
          <div
            key={etapa.id}
            onDragOver={(e) => { e.preventDefault(); setOverCol(etapa.id); }}
            onDragLeave={() => setOverCol((c) => (c === etapa.id ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              setOverCol(null);
              const leadId = e.dataTransfer.getData("text/lead-id");
              if (leadId) mover(leadId, etapa.id);
            }}
            className={cn(
              "w-72 shrink-0 flex flex-col rounded-xl border bg-muted/40 transition-colors",
              overCol === etapa.id ? "border-primary/60 bg-primary/5" : "border-border",
            )}
          >
            {/* Cabeçalho da coluna */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: etapa.cor || "#94a3b8" }} />
              <p className="text-sm font-semibold text-foreground truncate">{etapa.nome}</p>
              {etapa.ganho && <Trophy className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
              <span className="ml-auto text-[11px] font-semibold tabular-nums px-1.5 py-px rounded-full bg-muted text-muted-foreground">
                {itens.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2 p-2 min-h-[80px]">
              {itens.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">Nenhum lead</p>
              )}
              {itens.map((l) => (
                <div
                  key={l.id}
                  draggable={l.status === "ABERTO"}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/lead-id", l.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => onOpenLead(l.id)}
                  className={cn(
                    "rounded-lg border border-border bg-card p-3 shadow-sm cursor-pointer hover:border-primary/40 transition-colors",
                    l.status === "ABERTO" && "active:cursor-grabbing",
                    l.status === "GANHO" && "border-emerald-300 dark:border-emerald-500/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground leading-snug">{l.nome}</p>
                    {l.status === "GANHO" && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 shrink-0">
                        <Trophy className="h-3 w-3" /> Ganho
                      </span>
                    )}
                  </div>
                  {l.empresaNome && (
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Building2 className="h-3 w-3 shrink-0" /> {l.empresaNome}
                    </p>
                  )}
                  {Number(l.valorEstimado) > 0 && (
                    <p className="text-sm font-semibold text-foreground tabular-nums mt-1.5">{formatBRL(Number(l.valorEstimado))}</p>
                  )}
                  <div className="flex items-center justify-between gap-2 mt-2">
                    {l.campanha ? (
                      <span className={cn(
                        "inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium truncate",
                        PLATAFORMA_BADGE[l.campanha.plataforma] ?? PLATAFORMA_BADGE.OUTRO,
                      )}>
                        {l.campanha.nome}
                      </span>
                    ) : <span />}
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                      <Clock className="h-3 w-3" /> {tempoRelativo(l.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Rodapé: contagem + soma */}
            <div className="flex items-center justify-between px-3 py-2 border-t border-border text-xs text-muted-foreground">
              <span>{itens.length} lead{itens.length === 1 ? "" : "s"}</span>
              <span className="font-semibold tabular-nums">{formatBRL(soma)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
