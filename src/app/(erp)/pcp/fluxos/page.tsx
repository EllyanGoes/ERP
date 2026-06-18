"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";
import { Workflow, Plus, Sparkles, RefreshCw, Trash2, Pencil, X, Check } from "lucide-react";
import { seedTramontin } from "@/lib/pcp/seed-fluxo";

interface FluxoRow {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  item: { id: string; codigo: string; descricao: string } | null;
  versaoAtivaId: string | null;
  totalVersoes: number;
  ultimaVersao: { id: string; versao: number; status: string } | null;
  updatedAt: string;
}

const STATUS_STYLE: Record<string, string> = {
  PUBLICADA: "bg-success/10 text-success",
  RASCUNHO: "bg-warning/10 text-warning",
  ARQUIVADA: "bg-muted text-muted-foreground",
};
const STATUS_LABEL: Record<string, string> = { PUBLICADA: "Publicada", RASCUNHO: "Rascunho", ARQUIVADA: "Arquivada" };

export default function FluxosPage() {
  useTabTitle("Fluxos de Produção");
  const router = useRouter();
  const [fluxos, setFluxos] = useState<FluxoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const r = await fetch("/api/pcp/fluxos");
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao carregar");
      setFluxos(j.data ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function criar(nome: string, grafo?: unknown) {
    setBusy(true);
    setErro(null);
    try {
      const r = await fetch("/api/pcp/fluxos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, grafo }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao criar");
      router.push(`/pcp/fluxos/${j.data.id}/editor`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao criar");
      setBusy(false);
    }
  }

  async function excluir(f: FluxoRow) {
    if (!confirm(`Excluir o fluxo "${f.nome}"? Todas as versões serão removidas.`)) return;
    try {
      const r = await fetch(`/api/pcp/fluxos/${f.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao excluir");
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao excluir");
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Fluxos de Produção"
        subtitle="Desenhe o esquema produtivo (estoques → operações → WIP → produto acabado) no editor visual."
        breadcrumbs={[{ label: "PCP" }, { label: "Fluxos de Produção" }]}
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => criar("Tijolo 6 furos (exemplo)", seedTramontin())}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-200 dark:border-cyan-500/30 bg-cyan-50 dark:bg-cyan-500/15 px-3 py-2 text-sm font-medium text-cyan-700 dark:text-cyan-300 hover:bg-cyan-100 dark:bg-cyan-500/25 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" /> Criar exemplo
            </button>
            <button
              type="button"
              onClick={() => setNovoNome("")}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> Novo fluxo
            </button>
          </div>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-8">
        {erro && <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</div>}

        {novoNome !== null && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-cyan-200 dark:border-cyan-500/30 bg-cyan-50/40 p-3">
            <input
              autoFocus
              className="flex-1 rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
              placeholder="Nome do fluxo (ex.: Tijolo 8 furos)"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && novoNome.trim()) criar(novoNome.trim()); }}
            />
            <button onClick={() => novoNome.trim() && criar(novoNome.trim())} disabled={busy || !novoNome.trim()} className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50">
              <Check className="w-4 h-4" /> Criar e abrir
            </button>
            <button onClick={() => setNovoNome(null)} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
              <X className="w-4 h-4" /> Cancelar
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Carregando…
          </div>
        ) : fluxos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-cyan-50 dark:bg-cyan-500/15 flex items-center justify-center mb-3">
              <Workflow className="w-7 h-7 text-cyan-400" />
            </div>
            <p className="text-sm font-medium text-foreground">Nenhum fluxo ainda</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Crie um fluxo do zero ou use o <strong>exemplo Tramontin</strong> para ver o conceito (matéria-prima → preparação → conformação → secagem → queima → produto acabado).
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {fluxos.map((f) => {
              const st = f.ultimaVersao?.status ?? "RASCUNHO";
              return (
                <div key={f.id} className="group rounded-xl border border-border bg-card p-4 hover:border-cyan-300 hover:shadow-sm transition">
                  <div className="flex items-start justify-between gap-2">
                    <button onClick={() => router.push(`/pcp/fluxos/${f.id}/editor`)} className="flex items-start gap-2.5 min-w-0 text-left">
                      <span className="flex w-9 h-9 shrink-0 items-center justify-center rounded-lg bg-cyan-50 dark:bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
                        <Workflow className="w-4.5 h-4.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate group-hover:text-cyan-700 dark:text-cyan-300">{f.nome}</p>
                        <p className="text-xs text-muted-foreground truncate">{f.item ? f.item.descricao : f.descricao ?? "Sem produto vinculado"}</p>
                      </div>
                    </button>
                    <button onClick={() => excluir(f)} title="Excluir" className="p-1.5 rounded-lg text-muted-foreground/60 hover:bg-danger/10 hover:text-danger opacity-0 group-hover:opacity-100 transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[st])}>
                      {STATUS_LABEL[st] ?? st}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{f.totalVersoes} versão(ões)</span>
                    <button onClick={() => router.push(`/pcp/fluxos/${f.id}/editor`)} className="inline-flex items-center gap-1 text-xs text-cyan-700 dark:text-cyan-300 hover:text-cyan-900 font-medium">
                      <Pencil className="w-3.5 h-3.5" /> Abrir editor
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
