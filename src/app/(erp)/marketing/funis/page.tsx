"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import CreateDrawer from "@/components/shared/CreateDrawer";
import { useCreateFlow } from "@/components/shared/useCreateFlow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import { Plus, Search, Loader2, ChevronRight, Filter as FilterIcon, FileEdit, PlayCircle, Archive, type LucideIcon } from "lucide-react";

type FunilLista = {
  id: string;
  nome: string;
  descricao: string | null;
  status: "RASCUNHO" | "ATIVO" | "ARQUIVADO";
  updatedAt: string;
  _count: { nos: number; leads: number };
};

const FILTROS: { value: string; contadorKey: string; label: string; Icon?: LucideIcon }[] = [
  { value: "", contadorKey: "todos", label: "Todos" },
  { value: "RASCUNHO", contadorKey: "rascunho", label: "Rascunho", Icon: FileEdit },
  { value: "ATIVO", contadorKey: "ativo", label: "Ativo", Icon: PlayCircle },
  { value: "ARQUIVADO", contadorKey: "arquivado", label: "Arquivado", Icon: Archive },
];

const STATUS_BADGE: Record<FunilLista["status"], { label: string; cls: string }> = {
  RASCUNHO: { label: "Rascunho", cls: "bg-muted text-muted-foreground" },
  ATIVO: { label: "Ativo", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" },
  ARQUIVADO: { label: "Arquivado", cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" },
};

function fmtData(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function NovoFunilForm() {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const { confirmCreated, dialog } = useCreateFlow({
    entity: "funil",
    gender: "m",
    onNew: () => {
      setNome("");
      setDescricao("");
      setErro(null);
    },
    viewHref: (id) => `/marketing/funis/${id}`,
  });

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (nome.trim().length < 2) {
      setErro("Informe o nome do funil.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch("/api/marketing/funis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), descricao: descricao.trim() || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao criar o funil");
      confirmCreated(j.data.id);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao criar o funil");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Nome *</label>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: Captação Meta → WhatsApp" autoFocus />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Descrição</label>
        <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="objetivo do funil, público, oferta…" rows={3} />
      </div>
      {erro && <p className="text-sm text-danger">{erro}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={salvando} className="gap-2">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar funil
        </Button>
      </div>
      {dialog}
    </form>
  );
}

export default function FunisPage() {
  useTabTitle("Funis de Marketing");
  const router = useRouter();
  const [lista, setLista] = useState<FunilLista[]>([]);
  const [contadores, setContadores] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFiltro, setStatusFiltro] = usePersistedState("mkt-funis-status", "");
  const [openDrawer, setOpenDrawer] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (statusFiltro) params.set("status", statusFiltro);
      params.set("limit", "100");
      const res = await fetch(`/api/marketing/funis?${params.toString()}`);
      const json = await res.json();
      setLista(json.data ?? []);
      setContadores(json.contadores ?? {});
      setTotal(json.total ?? 0);
    } catch {
      setLista([]);
    } finally {
      setLoading(false);
    }
  }, [q, statusFiltro]);

  useEffect(() => {
    const t = setTimeout(carregar, 250);
    return () => clearTimeout(t);
  }, [carregar]);

  return (
    <div>
      <PageHeader
        title="Funis de Marketing"
        subtitle="Desenhe a jornada de aquisição e acompanhe os números"
        actions={
          <Button onClick={() => setOpenDrawer(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Funil
          </Button>
        }
      />

      <div className="px-8 pb-8">
        {/* Filtros */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar funil pelo nome..." className="pl-9 h-10 border-border" />
          </div>
          <div className="flex gap-1 rounded-lg border border-border p-1">
            {FILTROS.map((f) => {
              const ativo = statusFiltro === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => setStatusFiltro(f.value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
                    ativo ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {f.Icon && <f.Icon className="h-3.5 w-3.5" />}
                  {f.label}
                  {contadores[f.contadorKey] != null && (
                    <span className={cn("text-[11px] font-semibold tabular-nums px-1.5 py-px rounded-full", ativo ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground")}>
                      {contadores[f.contadorKey]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Lista */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : lista.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <FilterIcon className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">Nenhum funil encontrado</p>
              <p className="text-sm text-muted-foreground">Desenhe o primeiro funil da jornada de aquisição.</p>
              <Button onClick={() => setOpenDrawer(true)} className="mt-2 gap-2">
                <Plus className="h-4 w-4" /> Novo Funil
              </Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="px-5 py-2.5 font-semibold">Nome</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold text-center">Nós</th>
                  <th className="px-3 py-2.5 font-semibold text-center">Leads</th>
                  <th className="px-3 py-2.5 font-semibold">Atualizado em</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((f) => {
                  const badge = STATUS_BADGE[f.status] ?? STATUS_BADGE.RASCUNHO;
                  return (
                    <tr
                      key={f.id}
                      onClick={() => router.push(`/marketing/funis/${f.id}`)}
                      className="border-b border-border last:border-0 hover:bg-muted/40 cursor-pointer"
                    >
                      <td className="px-5 py-3">
                        <p className="font-medium text-foreground">{f.nome}</p>
                        {f.descricao && <p className="text-xs text-muted-foreground truncate max-w-md">{f.descricao}</p>}
                      </td>
                      <td className="px-3 py-3">
                        <span className={cn("inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full", badge.cls)}>{badge.label}</span>
                      </td>
                      <td className="px-3 py-3 text-center text-muted-foreground">{f._count.nos}</td>
                      <td className="px-3 py-3 text-center text-muted-foreground">{f._count.leads}</td>
                      <td className="px-3 py-3 text-muted-foreground">{fmtData(f.updatedAt)}</td>
                      <td className="px-3 py-3 text-right">
                        <ChevronRight className="h-4 w-4 text-muted-foreground/60 inline" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {!loading && total > lista.length && (
          <p className="text-xs text-muted-foreground mt-2">Mostrando {lista.length} de {total} funis — refine a busca para ver os demais.</p>
        )}
      </div>

      <CreateDrawer open={openDrawer} onOpenChange={setOpenDrawer} title="Novo Funil de Marketing" width="md" onCreated={carregar}>
        <NovoFunilForm />
      </CreateDrawer>
    </div>
  );
}
