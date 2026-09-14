"use client";

// Abre o cartão completo de uma tarefa (o mesmo popup do quadro) fora da
// página do projeto — Minhas Tarefas, Agenda etc. Carrega o board do projeto
// (colunas/membros/etiquetas que o TarefaCardDialog precisa) e monta o
// overlay igual ao de /projetos/[id].
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import EscClose from "@/components/shared/EscClose";
import { useSession } from "@/lib/session-context";
import TarefaCardDialog from "./TarefaCardDialog";
import { ProjetoBoardDTO } from "./tipos";

export default function TarefaCardOverlay({
  tarefaId, projetoId, onFechar, onMudou,
}: {
  tarefaId: string;
  projetoId: string;
  onFechar: () => void;
  /** Chamado quando o cartão altera algo (a lista de fora recarrega). */
  onMudou?: () => void;
}) {
  const { user } = useSession();
  const [board, setBoard] = useState<ProjetoBoardDTO | null>(null);
  const [erro, setErro] = useState("");
  // Boards já carregados nesta montagem — abrir outra tarefa do mesmo projeto é instantâneo.
  const cache = useRef(new Map<string, ProjetoBoardDTO>());

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) {
      const c = cache.current.get(projetoId);
      if (c) { setBoard(c); return; }
    }
    try {
      const res = await fetch(`/api/projetos/${projetoId}`);
      const j = await res.json();
      if (!res.ok) { setErro(j.error || "Não foi possível abrir o projeto."); return; }
      cache.current.set(projetoId, j.data);
      setBoard(j.data);
    } catch {
      setErro("Erro de conexão");
    }
  }, [projetoId]);

  useEffect(() => { setBoard(null); setErro(""); carregar(); }, [carregar]);

  function mudou() {
    carregar(true);
    onMudou?.();
    try { window.dispatchEvent(new Event("erp:tarefas-mudou")); } catch { /* SSR */ }
  }

  const podeEditar = !!board && board.meuNivel !== "LEITURA";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}
    >
      <EscClose onClose={onFechar} />
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-5xl my-6">
        {board ? (
          <TarefaCardDialog
            tarefaId={tarefaId}
            board={board}
            podeEditar={podeEditar}
            usuarioId={user?.id ?? ""}
            onFechar={onFechar}
            onMudou={mudou}
          />
        ) : erro ? (
          <div className="px-6 py-10 text-center text-sm text-danger">{erro}</div>
        ) : (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        )}
      </div>
    </div>
  );
}
