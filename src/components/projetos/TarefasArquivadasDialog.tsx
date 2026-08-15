"use client";

// Cartões arquivados do quadro (ícone de arquivo no cabeçalho): lista com
// restaurar (volta pra coluna de origem) e excluir de vez (dono/ADMIN).
import { useState, useEffect } from "react";
import EscClose from "@/components/shared/EscClose";
import { Loader2, X, Archive, ArchiveRestore, Trash2 } from "lucide-react";

type TarefaArquivadaDTO = {
  id: string;
  titulo: string;
  updatedAt: string;
  concluidaEm: string | null;
  coluna: { nome: string };
};

export default function TarefasArquivadasDialog({
  projetoId, podeEditar, podeGerenciar, onFechar, onMudou,
}: {
  projetoId: string;
  podeEditar: boolean;
  podeGerenciar: boolean;
  onFechar: () => void;
  onMudou: () => void;
}) {
  const [tarefas, setTarefas] = useState<TarefaArquivadaDTO[]>([]);
  const [loading, setLoading] = useState(true);
  // Exclusão definitiva em dois cliques: o primeiro arma a confirmação.
  const [confirmaExcluir, setConfirmaExcluir] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projetos/${projetoId}/tarefas?arquivadas=1`)
      .then((r) => r.json())
      .then((j) => setTarefas(j.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projetoId]);

  async function restaurar(id: string) {
    setTarefas((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/projetos/tarefas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arquivada: false }),
    }).catch(() => {});
    onMudou();
  }

  async function excluir(id: string) {
    if (confirmaExcluir !== id) { setConfirmaExcluir(id); return; }
    setConfirmaExcluir(null);
    setTarefas((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/projetos/tarefas/${id}`, { method: "DELETE" }).catch(() => {});
    onMudou();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}
    >
      <EscClose onClose={onFechar} />
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <Archive className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground flex-1">Cartões arquivados</h2>
          <button onClick={onFechar} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : tarefas.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">Nenhum cartão arquivado.</p>
          ) : (
            <div className="space-y-1.5">
              {tarefas.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{t.titulo}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t.coluna.nome} · arquivado em {new Date(t.updatedAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  {podeEditar && (
                    <button
                      onClick={() => restaurar(t.id)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0"
                      title="Restaurar para o quadro"
                    >
                      <ArchiveRestore className="w-3.5 h-3.5" /> Restaurar
                    </button>
                  )}
                  {podeGerenciar && (
                    <button
                      onClick={() => excluir(t.id)}
                      className={
                        confirmaExcluir === t.id
                          ? "inline-flex items-center gap-1 text-xs font-semibold text-danger shrink-0"
                          : "inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-danger shrink-0"
                      }
                      title="Excluir definitivamente"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> {confirmaExcluir === t.id ? "Confirmar?" : "Excluir"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
