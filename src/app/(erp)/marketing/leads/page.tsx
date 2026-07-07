"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import CreateDrawer from "@/components/shared/CreateDrawer";
import LeadForm from "@/components/marketing/leads/LeadForm";
import LeadsKanban from "@/components/marketing/leads/LeadsKanban";
import LeadDrawer from "@/components/marketing/leads/LeadDrawer";
import { PLATAFORMA_BADGE } from "@/components/marketing/CampanhaForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ComboboxWithCreate, { type ComboboxOption } from "@/components/shared/ComboboxWithCreate";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn, formatBRL, formatDate } from "@/lib/utils";
import { Plus, Search, Loader2, Users, LayoutGrid, Table2, Mail, Phone } from "lucide-react";

type Lead = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  empresaNome: string | null;
  cidade: string | null;
  estado: string | null;
  status: "ABERTO" | "GANHO" | "PERDIDO";
  valorEstimado: number | string | null;
  convertidoEm: string | null;
  createdAt: string;
  campanha: { id: string; nome: string; plataforma: string } | null;
  etapa: { id: string; nome: string; cor: string | null; ganho: boolean } | null;
  cliente: { id: string; razaoSocial: string } | null;
  etapaId: string | null;
  campanhaId: string | null;
};

type Contadores = { todos: number; abertos: number; ganhos: number; perdidos: number };

const STATUS_CHIPS: { value: string; label: string; key: keyof Contadores }[] = [
  { value: "", label: "Todos", key: "todos" },
  { value: "ABERTO", label: "Abertos", key: "abertos" },
  { value: "GANHO", label: "Ganhos", key: "ganhos" },
  { value: "PERDIDO", label: "Perdidos", key: "perdidos" },
];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  ABERTO: { label: "Aberto", cls: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400" },
  GANHO: { label: "Ganho", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" },
  PERDIDO: { label: "Perdido", cls: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400" },
};

export default function LeadsPage() {
  useTabTitle("Leads");
  const [lista, setLista] = useState<Lead[]>([]);
  const [contadores, setContadores] = useState<Contadores>({ todos: 0, abertos: 0, ganhos: 0, perdidos: 0 });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = usePersistedState("mkt-leads-q", "");
  const [status, setStatus] = usePersistedState("mkt-leads-status", "");
  const [campanhaId, setCampanhaId] = usePersistedState("mkt-leads-campanha", "");
  const [view, setView] = usePersistedState<"kanban" | "tabela">("mkt-leads-view", "kanban");
  const [campanhas, setCampanhas] = useState<ComboboxOption[]>([]);
  const [openDrawer, setOpenDrawer] = useState(false);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    fetch("/api/marketing/campanhas?limit=100")
      .then((r) => r.json())
      .then((j) => setCampanhas((j.data ?? []).map((c: { id: string; nome: string }) => ({ value: c.id, label: c.nome }))))
      .catch(() => {});
  }, []);

  const carregar = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (campanhaId) params.set("campanhaId", campanhaId);
    params.set("limit", "200");
    const res = await fetch(`/api/marketing/leads?${params.toString()}`);
    const json = await res.json();
    setLista(json.data ?? []);
    setContadores(json.contadores ?? { todos: 0, abertos: 0, ganhos: 0, perdidos: 0 });
    setLoading(false);
  }, [q, status, campanhaId]);

  useEffect(() => {
    const t = setTimeout(carregar, 250);
    return () => clearTimeout(t);
  }, [carregar, reloadKey]);

  function recarregarTudo() {
    setReloadKey((k) => k + 1);
  }

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle="Funil de oportunidades: capture, acompanhe e converta leads em clientes"
        actions={
          <Button onClick={() => setOpenDrawer(true)} className="gap-2"><Plus className="h-4 w-4" /> Novo Lead</Button>
        }
      />

      <div className="px-8 pb-8">
        {/* Filtros + toggle de visualização */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          {/* Toggle Tabela ⇄ Kanban */}
          <div className="flex gap-1 rounded-lg border border-border p-1">
            <button
              onClick={() => setView("kanban")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
                view === "kanban" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Kanban
            </button>
            <button
              onClick={() => setView("tabela")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
                view === "tabela" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Table2 className="h-3.5 w-3.5" /> Tabela
            </button>
          </div>

          <div className="relative flex-1 max-w-md min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, empresa ou contato..." className="pl-9 h-10 border-border" />
          </div>

          {/* Chips de status — só fazem sentido na tabela (o kanban mostra abertos/ganhos) */}
          {view === "tabela" && (
            <div className="flex gap-1 rounded-lg border border-border p-1">
              {STATUS_CHIPS.map((f) => {
                const ativo = status === f.value;
                return (
                  <button
                    key={f.value}
                    onClick={() => setStatus(f.value)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
                      ativo ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {f.label}
                    <span className={cn("text-[11px] font-semibold tabular-nums px-1.5 py-px rounded-full", ativo ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground")}>
                      {contadores[f.key] ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <ComboboxWithCreate
            options={campanhas}
            value={campanhaId}
            onChange={setCampanhaId}
            placeholder="Todas as campanhas"
            noneLabel="Todas as campanhas"
            className="w-64"
          />
        </div>

        {view === "kanban" ? (
          <LeadsKanban q={q} campanhaId={campanhaId} reloadKey={reloadKey} onOpenLead={setLeadId} />
        ) : (
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : lista.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><Users className="h-6 w-6 text-muted-foreground" /></div>
                <p className="text-sm font-medium text-foreground">Nenhum lead encontrado</p>
                <p className="text-sm text-muted-foreground">Cadastre um lead para começar o acompanhamento.</p>
                <Button onClick={() => setOpenDrawer(true)} className="mt-2 gap-2"><Plus className="h-4 w-4" /> Novo Lead</Button>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                    <th className="px-5 py-2.5 font-semibold">Nome</th>
                    <th className="px-3 py-2.5 font-semibold">Contato</th>
                    <th className="px-3 py-2.5 font-semibold">Etapa</th>
                    <th className="px-3 py-2.5 font-semibold">Campanha</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Valor estimado</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                    <th className="px-3 py-2.5 font-semibold">Criado em</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((l) => {
                    const st = STATUS_BADGE[l.status] ?? STATUS_BADGE.ABERTO;
                    return (
                      <tr
                        key={l.id}
                        onClick={() => setLeadId(l.id)}
                        className="border-b border-border last:border-0 hover:bg-muted/40 cursor-pointer"
                      >
                        <td className="px-5 py-3">
                          <p className="font-medium text-foreground">{l.nome}</p>
                          {l.empresaNome && <p className="text-xs text-muted-foreground">{l.empresaNome}</p>}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {l.email && <p className="flex items-center gap-1.5 text-xs"><Mail className="h-3 w-3 shrink-0" /> {l.email}</p>}
                          {l.telefone && <p className="flex items-center gap-1.5 text-xs"><Phone className="h-3 w-3 shrink-0" /> {l.telefone}</p>}
                          {!l.email && !l.telefone && "—"}
                        </td>
                        <td className="px-3 py-3">
                          {l.etapa ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-foreground">
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: l.etapa.cor || "#94a3b8" }} />
                              {l.etapa.nome}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-3">
                          {l.campanha ? (
                            <span className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium",
                              PLATAFORMA_BADGE[l.campanha.plataforma] ?? PLATAFORMA_BADGE.OUTRO,
                            )}>
                              {l.campanha.nome}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                          {Number(l.valorEstimado) > 0 ? formatBRL(Number(l.valorEstimado)) : "—"}
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium", st.cls)}>{st.label}</span>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{formatDate(l.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <CreateDrawer open={openDrawer} onOpenChange={setOpenDrawer} title="Novo Lead" width="lg" onCreated={recarregarTudo}>
        <LeadForm />
      </CreateDrawer>

      <LeadDrawer leadId={leadId} onClose={() => setLeadId(null)} onChanged={recarregarTudo} />
    </div>
  );
}
