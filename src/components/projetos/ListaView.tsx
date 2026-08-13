"use client";

// Visão Lista — tarefas agrupadas por coluna, com edição rápida inline.
import { cn } from "@/lib/utils";
import { CheckSquare, Paperclip, MessageSquare } from "lucide-react";
import { AvatarUsuario, EtiquetaChip } from "./comum";
import { ProjetoBoardDTO, TarefaResumoDTO, prazoInfo, PRIORIDADES } from "./tipos";

export default function ListaView({
  board, tarefas, podeEditar, onAbrirTarefa, onRecarregar,
}: {
  board: ProjetoBoardDTO;
  tarefas: TarefaResumoDTO[];
  podeEditar: boolean;
  onAbrirTarefa: (id: string) => void;
  onRecarregar: () => void;
}) {
  async function patchRapido(tarefaId: string, data: Record<string, unknown>) {
    await fetch(`/api/projetos/tarefas/${tarefaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => {});
    onRecarregar();
  }

  return (
    <div className="px-6 py-4 space-y-6 max-w-6xl">
      {board.colunas.map((coluna) => {
        const lista = tarefas.filter((t) => t.colunaId === coluna.id).sort((a, b) => a.ordem - b.ordem);
        if (lista.length === 0) return null;
        return (
          <div key={coluna.id} className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-muted border-b border-border">
              {coluna.cor && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: coluna.cor }} />}
              <span className="font-semibold text-sm text-foreground">{coluna.nome}</span>
              <span className="text-xs text-muted-foreground">{lista.length}</span>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {lista.map((t) => {
                  const prazo = prazoInfo(t.prazo, !!t.concluidaEm);
                  return (
                    <tr key={t.id} className="hover:bg-muted cursor-pointer" onClick={() => onAbrirTarefa(t.id)}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn("text-foreground", t.concluidaEm && "line-through text-muted-foreground")}>{t.titulo}</span>
                          {t.etiquetas.map((e) => <EtiquetaChip key={e.id} etiqueta={e} small />)}
                          {t.checklistTotal > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                              <CheckSquare className="w-3 h-3" /> {t.checklistFeitos}/{t.checklistTotal}
                            </span>
                          )}
                          {t._count.anexos > 0 && <Paperclip className="w-3 h-3 text-muted-foreground" />}
                          {t._count.comentarios > 0 && <MessageSquare className="w-3 h-3 text-muted-foreground" />}
                        </div>
                      </td>
                      <td className="px-3 py-2 w-36" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={t.prioridade}
                          disabled={!podeEditar}
                          onChange={(e) => patchRapido(t.id, { prioridade: e.target.value })}
                          className="w-full text-xs border border-transparent hover:border-border rounded-md bg-transparent px-1 py-1 text-foreground"
                        >
                          {Object.entries(PRIORIDADES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 w-44" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={t.responsavel?.id ?? ""}
                          disabled={!podeEditar}
                          onChange={(e) => patchRapido(t.id, { responsavelId: e.target.value || null })}
                          className="w-full text-xs border border-transparent hover:border-border rounded-md bg-transparent px-1 py-1 text-foreground"
                        >
                          <option value="">— Ninguém —</option>
                          {board.membros.map((m) => <option key={m.usuarioId} value={m.usuarioId}>{m.usuario.nome}</option>)}
                        </select>
                      </td>
                      <td className={cn("px-4 py-2 w-24 text-right text-xs whitespace-nowrap", prazo?.cls ?? "text-muted-foreground/50")}>
                        {prazo?.label ?? "—"}
                      </td>
                      <td className="px-3 py-2 w-10">
                        {t.responsavel && <AvatarUsuario nome={t.responsavel.nome} size="sm" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      {tarefas.length === 0 && <p className="text-sm text-muted-foreground italic text-center py-12">Nenhuma tarefa com os filtros atuais.</p>}
    </div>
  );
}
