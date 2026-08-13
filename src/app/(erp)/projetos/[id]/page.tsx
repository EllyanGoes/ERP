"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import EscClose from "@/components/shared/EscClose";
import { useTabTitle } from "@/lib/tabs-context";
import { useSession } from "@/lib/session-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import {
  Loader2, ArrowLeft, Star, Settings2, LayoutGrid, List, Calendar as CalendarIcon,
  GanttChartSquare, Activity, Search, X,
} from "lucide-react";
import { AvatarUsuario } from "@/components/projetos/comum";
import { ProjetoBoardDTO, TarefaResumoDTO } from "@/components/projetos/tipos";
import KanbanView from "@/components/projetos/KanbanView";
import ListaView from "@/components/projetos/ListaView";
import CalendarioView from "@/components/projetos/CalendarioView";
import TimelineView from "@/components/projetos/TimelineView";
import AtividadeView from "@/components/projetos/AtividadeView";
import TarefaCardDialog from "@/components/projetos/TarefaCardDialog";
import ProjetoConfigDialog from "@/components/projetos/ProjetoConfigDialog";

type Visao = "kanban" | "lista" | "calendario" | "timeline" | "atividade";

const VISOES: { key: Visao; label: string; icon: typeof LayoutGrid }[] = [
  { key: "kanban",     label: "Quadro",         icon: LayoutGrid },
  { key: "lista",      label: "Lista",          icon: List },
  { key: "calendario", label: "Calendário",     icon: CalendarIcon },
  { key: "timeline",   label: "Linha do tempo", icon: GanttChartSquare },
  { key: "atividade",  label: "Atividade",      icon: Activity },
];

export default function ProjetoBoardPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useSession();

  const [board, setBoard] = useState<ProjetoBoardDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [visao, setVisao] = usePersistedState<Visao>(`projetos:visao:${id}`, "kanban");
  const [showConfig, setShowConfig] = useState(false);

  // Filtros (persistidos por usuário/projeto)
  const [filtroResp, setFiltroResp] = usePersistedState<string>(`projetos:fresp:${id}`, "");
  const [filtroEtiqueta, setFiltroEtiqueta] = usePersistedState<string>(`projetos:fetq:${id}`, "");
  const [filtroBusca, setFiltroBusca] = useState("");

  // Cartão aberto via ?tarefa= (link compartilhável)
  const tarefaAberta = searchParams.get("tarefa");

  const load = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      const res = await fetch(`/api/projetos/${id}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Erro ao carregar"); return; }
      setBoard(json.data);
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // Recarrega ao voltar o foco (colaboração sem websocket — decisão do PRD)
  useEffect(() => {
    const onFocus = () => load(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  useTabTitle(board ? board.nome : null);

  const abrirTarefa = useCallback((tarefaId: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("tarefa", tarefaId);
    router.replace(`/projetos/${id}?${p.toString()}`, { scroll: false });
  }, [router, id, searchParams]);

  const fecharTarefa = useCallback(() => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("tarefa");
    router.replace(`/projetos/${id}${p.size ? `?${p.toString()}` : ""}`, { scroll: false });
    load(true); // reflete edições do cartão nas visões
  }, [router, id, searchParams, load]);

  async function toggleFavorito() {
    if (!board) return;
    setBoard({ ...board, meuFavorito: !board.meuFavorito });
    await fetch(`/api/projetos/${id}/membros`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorito: !board.meuFavorito }),
    }).catch(() => {});
  }

  // Mutação local otimista usada pelas visões (drag & drop, edições rápidas)
  const atualizarTarefaLocal = useCallback((tarefaId: string, patch: Partial<TarefaResumoDTO>) => {
    setBoard((prev) => prev ? {
      ...prev,
      tarefas: prev.tarefas.map((t) => (t.id === tarefaId ? { ...t, ...patch } : t)),
    } : prev);
  }, []);

  // Inserção otimista (novo cartão aparece na hora; o POST troca o id depois)
  const inserirTarefaLocal = useCallback((t: TarefaResumoDTO) => {
    setBoard((prev) => prev ? { ...prev, tarefas: [...prev.tarefas, t] } : prev);
  }, []);

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!board) return <div className="px-8 pt-8 text-danger">{error || "Projeto não encontrado"}</div>;

  const podeEditar = board.meuNivel !== "LEITURA" && board.status === "ATIVO";
  const podeGerenciar = board.meuNivel === "DONO" || board.meuNivel === "ADMIN";

  const tarefasFiltradas = board.tarefas.filter((t) => {
    if (filtroResp === "__sem__" ? t.membros.length > 0 : filtroResp && !t.membros.some((m) => m.id === filtroResp)) return false;
    if (filtroEtiqueta && !t.etiquetas.some((e) => e.id === filtroEtiqueta)) return false;
    if (filtroBusca && !t.titulo.toLowerCase().includes(filtroBusca.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Cabeçalho do quadro ─────────────────────────────────────────── */}
      <div className="px-6 pt-4 pb-3 border-b border-border shrink-0 space-y-3" style={{ borderTopColor: board.cor ?? undefined }}>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => router.push("/projetos")} className="text-muted-foreground hover:text-foreground" title="Voltar">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: board.cor ?? "#64748b" }} />
          <h1 className="font-bold text-lg text-foreground truncate max-w-md" title={board.nome}>{board.nome}</h1>
          <button
            onClick={toggleFavorito}
            className={cn("p-1 rounded-md", board.meuFavorito ? "text-amber-400" : "text-muted-foreground/50 hover:text-amber-400")}
            title="Favoritar"
          >
            <Star className="w-4 h-4" fill={board.meuFavorito ? "currentColor" : "none"} />
          </button>
          {board.status === "ARQUIVADO" && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Arquivado</span>
          )}
          {board.visibilidade === "PUBLICO" && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-info/10 text-info">Público</span>
          )}
          <div className="flex -space-x-1.5 ml-1">
            {board.membros.slice(0, 6).map((m) => <AvatarUsuario key={m.id} nome={m.usuario.nome} size="sm" />)}
            {board.membros.length > 6 && (
              <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground text-[9px] font-semibold inline-flex items-center justify-center">
                +{board.membros.length - 6}
              </span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {podeGerenciar && (
              <Button size="sm" variant="outline" onClick={() => setShowConfig(true)}>
                <Settings2 className="w-4 h-4 mr-1.5" /> Configurar
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Visões */}
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            {VISOES.map((v) => (
              <button
                key={v.key}
                onClick={() => setVisao(v.key)}
                title={v.label}
                aria-label={v.label}
                className={cn(
                  "px-3 py-1.5 inline-flex items-center transition-colors",
                  visao === v.key ? "bg-info/10 text-info" : "text-muted-foreground hover:bg-muted"
                )}
              >
                <v.icon className="w-4 h-4" />
              </button>
            ))}
          </div>

          {/* Filtros */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={filtroBusca}
              onChange={(e) => setFiltroBusca(e.target.value)}
              placeholder="Buscar tarefa..."
              className="pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
            />
          </div>
          <select
            value={filtroResp}
            onChange={(e) => setFiltroResp(e.target.value)}
            className="text-sm border border-border rounded-lg bg-card px-2 py-1.5 text-foreground"
          >
            <option value="">Todos os responsáveis</option>
            <option value="__sem__">Sem responsável</option>
            {board.membros.map((m) => <option key={m.usuarioId} value={m.usuarioId}>{m.usuario.nome}</option>)}
          </select>
          <select
            value={filtroEtiqueta}
            onChange={(e) => setFiltroEtiqueta(e.target.value)}
            className="text-sm border border-border rounded-lg bg-card px-2 py-1.5 text-foreground"
          >
            <option value="">Todas as etiquetas</option>
            {board.etiquetas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
          {(filtroResp || filtroEtiqueta || filtroBusca) && (
            <button
              onClick={() => { setFiltroResp(""); setFiltroEtiqueta(""); setFiltroBusca(""); }}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Limpar
            </button>
          )}
        </div>
      </div>

      {/* ── Visão ativa ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-auto">
        {visao === "kanban" && (
          <KanbanView
            board={board}
            tarefas={tarefasFiltradas}
            podeEditar={podeEditar}
            podeGerenciar={podeGerenciar}
            onAbrirTarefa={abrirTarefa}
            onRecarregar={() => load(true)}
            onAtualizarLocal={atualizarTarefaLocal}
            onInserirLocal={inserirTarefaLocal}
          />
        )}
        {visao === "lista" && (
          <ListaView board={board} tarefas={tarefasFiltradas} podeEditar={podeEditar} onAbrirTarefa={abrirTarefa} onRecarregar={() => load(true)} />
        )}
        {visao === "calendario" && (
          <CalendarioView tarefas={tarefasFiltradas} podeEditar={podeEditar} onAbrirTarefa={abrirTarefa} onRecarregar={() => load(true)} />
        )}
        {visao === "timeline" && (
          <TimelineView tarefas={tarefasFiltradas} onAbrirTarefa={abrirTarefa} />
        )}
        {visao === "atividade" && <AtividadeView projetoId={board.id} onAbrirTarefa={abrirTarefa} />}
      </div>

      {/* ── Cartão da tarefa (?tarefa=) ─────────────────────────────────── */}
      {tarefaAberta && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
          onMouseDown={(e) => { if (e.target === e.currentTarget) fecharTarefa(); }}
        >
          <EscClose onClose={fecharTarefa} />
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl my-6">
            <TarefaCardDialog
              tarefaId={tarefaAberta}
              board={board}
              podeEditar={podeEditar}
              usuarioId={user?.id ?? ""}
              onFechar={fecharTarefa}
              onMudou={() => load(true)}
            />
          </div>
        </div>
      )}

      {/* ── Configurações do projeto ────────────────────────────────────── */}
      {showConfig && (
        <ProjetoConfigDialog
          board={board}
          onFechar={() => setShowConfig(false)}
          onMudou={() => load(true)}
          onExcluido={() => router.push("/projetos")}
        />
      )}
    </div>
  );
}
