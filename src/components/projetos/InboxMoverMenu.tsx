"use client";

// Menu "Mover para projeto…" da caixa de entrada: lista os projetos ativos
// em que o usuário é membro; escolher um chama POST /inbox/[id]/mover.
import { useEffect, useRef, useState } from "react";
import { FolderKanban, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ProjetoOpcao = { id: string; nome: string; cor: string | null; status: string; souMembro: boolean };

export type InboxItemDTO = {
  id: string;
  titulo: string;
  notas: string | null;
  ordem: number;
  concluidaEm: string | null;
  createdAt: string;
};

/** Dispara p/ o widget do topo e a página recarregarem a caixa. */
export function avisarInboxMudou() {
  window.dispatchEvent(new Event("erp:inbox-mudou"));
}

export async function moverInboxParaProjeto(itemId: string, projetoId: string): Promise<{ tarefaId: string; projetoId: string } | null> {
  const res = await fetch(`/api/projetos/inbox/${itemId}/mover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projetoId }),
  }).catch(() => null);
  const j = await res?.json().catch(() => ({}));
  if (!res?.ok) return null;
  avisarInboxMudou();
  return j.data ?? null;
}

export default function InboxMoverMenu({
  itemId, onMovido, onFechar, align = "right",
}: {
  itemId: string;
  onMovido: (r: { tarefaId: string; projetoId: string; projetoNome: string }) => void;
  onFechar: () => void;
  align?: "left" | "right";
}) {
  const [projetos, setProjetos] = useState<ProjetoOpcao[] | null>(null);
  const [busca, setBusca] = useState("");
  const [movendo, setMovendo] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/projetos")
      .then((r) => r.json())
      .then((j) => setProjetos((j.data ?? []).filter((p: ProjetoOpcao) => p.status === "ATIVO" && p.souMembro)))
      .catch(() => setProjetos([]));
  }, []);

  useEffect(() => {
    function fora(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onFechar(); }
    function esc(e: KeyboardEvent) { if (e.key === "Escape") { e.stopPropagation(); onFechar(); } }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc, true); };
  }, [onFechar]);

  const lista = (projetos ?? []).filter((p) => !busca || p.nome.toLowerCase().includes(busca.toLowerCase()));

  async function mover(p: ProjetoOpcao) {
    if (movendo) return;
    setMovendo(true);
    const r = await moverInboxParaProjeto(itemId, p.id);
    setMovendo(false);
    if (r) onMovido({ ...r, projetoNome: p.nome });
  }

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      className={cn("absolute top-full mt-1 z-50 w-64 bg-card border border-border rounded-xl shadow-xl flex flex-col overflow-hidden", align === "right" ? "right-0" : "left-0")}
    >
      <div className="px-3 py-2 border-b border-border">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Mover para projeto</p>
        <input
          autoFocus
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && lista[0]) mover(lista[0]); }}
          placeholder="Buscar projeto…"
          className="w-full text-sm bg-muted rounded-md px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500 text-foreground"
        />
      </div>
      <div className="max-h-64 overflow-y-auto py-1">
        {projetos === null ? (
          <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
        ) : lista.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground text-center">Nenhum projeto.</p>
        ) : (
          lista.map((p) => (
            <button
              key={p.id}
              disabled={movendo}
              onClick={() => mover(p)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-muted text-left disabled:opacity-50"
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.cor ?? "#64748b" }} />
              <span className="truncate flex-1">{p.nome}</span>
              <FolderKanban className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
