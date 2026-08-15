"use client";

// Visão Quadro (kanban) — colunas com drag & drop nativo de cartões e colunas.
import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Plus, MoreHorizontal, CheckSquare, Paperclip, MessageSquare, GripVertical, Check, Pencil, X, Clock, AlignLeft, Circle, CheckCircle2 } from "lucide-react";
import EscClose from "@/components/shared/EscClose";
import { useSession } from "@/lib/session-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AvatarUsuario, EtiquetaChip, PrioridadeBadge } from "./comum";
import { ProjetoBoardDTO, TarefaResumoDTO, prazoInfo } from "./tipos";
import TarefaQuickEdit from "./TarefaQuickEdit";

type Props = {
  board: ProjetoBoardDTO;
  tarefas: TarefaResumoDTO[];
  podeEditar: boolean;
  podeGerenciar: boolean;
  onAbrirTarefa: (id: string) => void;
  onRecarregar: () => void;
  onAtualizarLocal: (tarefaId: string, patch: Partial<TarefaResumoDTO>) => void;
  // Inserção OTIMISTA: o cartão novo entra na coluna na hora (id temporário) e o
  // POST corre em segundo plano — o id real substitui o temporário na resposta.
  onInserirLocal: (t: TarefaResumoDTO) => void;
};

export default function KanbanView({ board, tarefas, podeEditar, podeGerenciar, onAbrirTarefa, onRecarregar, onAtualizarLocal, onInserirLocal }: Props) {
  const [dragTarefaId, setDragTarefaId] = useState<string | null>(null);
  const [dropAlvo, setDropAlvo] = useState<{ colunaId: string; aposTarefaId: string | null } | null>(null);
  const [dragColunaId, setDragColunaId] = useState<string | null>(null);
  const [novaTarefaCol, setNovaTarefaCol] = useState<string | null>(null);
  const [novoTitulo, setNovoTitulo] = useState("");
  const [menuColuna, setMenuColuna] = useState<string | null>(null);
  const [novaColuna, setNovaColuna] = useState(false);
  const [novaColunaNome, setNovaColunaNome] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Edição rápida (lápis no hover, ou atalhos com o mouse sobre o cartão:
  // E = editar · M = membros · D = prazo · Espaço = me atribuir/remover ·
  // Delete/Backspace = arquivar)
  const { user } = useSession();
  const [quickEdit, setQuickEdit] = useState<{ tarefa: TarefaResumoDTO; rect: { top: number; left: number; width: number; right: number }; submenu?: "membros" | "prazo" } | null>(null);
  const hoverRef = useRef<{ tarefa: TarefaResumoDTO; el: HTMLElement } | null>(null);

  // Espaço (estilo Trello): alterna o USUÁRIO LOGADO como membro do cartão.
  const toggleMeuMembro = useCallback(async (t: TarefaResumoDTO) => {
    if (!user) return;
    const sou = t.membros.some((m) => m.id === user.id);
    const novos = sou ? t.membros.filter((m) => m.id !== user.id) : [...t.membros, { id: user.id, nome: user.nome }];
    onAtualizarLocal(t.id, { membros: novos });
    await fetch(`/api/projetos/tarefas/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ membroIds: novos.map((m) => m.id) }),
    }).catch(() => onRecarregar());
  }, [user, onAtualizarLocal, onRecarregar]);

  // Delete/Backspace (estilo Trello): arquiva o cartão sob o mouse — some na
  // hora e fica recuperável no painel de arquivadas do cabeçalho do quadro.
  const arquivarTarefa = useCallback(async (t: TarefaResumoDTO) => {
    onAtualizarLocal(t.id, { arquivada: true });
    await fetch(`/api/projetos/tarefas/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arquivada: true }),
    }).catch(() => onRecarregar());
  }, [onAtualizarLocal, onRecarregar]);

  useEffect(() => {
    if (!podeEditar) return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tecla = e.key === " " ? " " : e.key.toLowerCase();
      if (![" ", "e", "m", "d", "backspace", "delete"].includes(tecla)) return;
      const alvo = e.target as HTMLElement;
      if (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT" || alvo.isContentEditable) return;
      const hov = hoverRef.current;
      if (!hov || hov.tarefa.id.startsWith("temp-")) return;
      e.preventDefault();
      if (tecla === " ") { toggleMeuMembro(hov.tarefa); return; }
      if (tecla === "backspace" || tecla === "delete") { arquivarTarefa(hov.tarefa); return; }
      const r = hov.el.getBoundingClientRect();
      setQuickEdit({
        tarefa: hov.tarefa,
        rect: { top: r.top, left: r.left, width: r.width, right: r.right },
        submenu: tecla === "m" ? "membros" : tecla === "d" ? "prazo" : undefined,
      });
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [podeEditar, toggleMeuMembro, arquivarTarefa]);

  function abrirQuickEdit(tarefa: TarefaResumoDTO, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    setQuickEdit({ tarefa, rect: { top: r.top, left: r.left, width: r.width, right: r.right } });
  }

  const temColunaConclui = board.colunas.some((c) => c.concluiTarefa);

  // Círculo do cartão: concluir move p/ a coluna de conclusão; reabrir volta p/ a primeira
  async function concluirRapido(t: TarefaResumoDTO) {
    const destino = t.concluidaEm
      ? board.colunas.find((c) => !c.concluiTarefa)
      : board.colunas.find((c) => c.concluiTarefa);
    if (!destino) return;
    onAtualizarLocal(t.id, { colunaId: destino.id, concluidaEm: destino.concluiTarefa ? new Date().toISOString() : null });
    const res = await fetch(`/api/projetos/tarefas/${t.id}/mover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ colunaId: destino.id }),
    }).catch(() => null);
    if (!res?.ok) onRecarregar(); else onRecarregar();
  }

  const porColuna = (colunaId: string) =>
    tarefas.filter((t) => t.colunaId === colunaId).sort((a, b) => a.ordem - b.ordem);

  // ── Drag & drop de cartões ──────────────────────────────────────────────
  async function soltarCartao() {
    if (!dragTarefaId || !dropAlvo) { setDragTarefaId(null); setDropAlvo(null); return; }
    const { colunaId, aposTarefaId } = dropAlvo;
    const destino = board.colunas.find((c) => c.id === colunaId);
    // Otimista: muda coluna localmente; a ordem exata vem no reload
    onAtualizarLocal(dragTarefaId, {
      colunaId,
      concluidaEm: destino?.concluiTarefa ? new Date().toISOString() : null,
      ordem: (() => {
        const lista = porColuna(colunaId).filter((t) => t.id !== dragTarefaId);
        if (!aposTarefaId) return (lista[0]?.ordem ?? 1024) - 1;
        const idx = lista.findIndex((t) => t.id === aposTarefaId);
        const antes = lista[idx]?.ordem ?? 0;
        const depois = lista[idx + 1]?.ordem ?? antes + 2048;
        return (antes + depois) / 2;
      })(),
    });
    const tarefaId = dragTarefaId;
    setDragTarefaId(null); setDropAlvo(null);
    const res = await fetch(`/api/projetos/tarefas/${tarefaId}/mover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ colunaId, aposTarefaId }),
    }).catch(() => null);
    if (!res?.ok) onRecarregar();
  }

  // ── Drag & drop de colunas (gerentes) ───────────────────────────────────
  async function soltarColuna(antesDeColunaId: string | null) {
    if (!dragColunaId) return;
    const ids = board.colunas.map((c) => c.id).filter((cid) => cid !== dragColunaId);
    const idx = antesDeColunaId ? ids.indexOf(antesDeColunaId) : ids.length;
    ids.splice(idx === -1 ? ids.length : idx, 0, dragColunaId);
    setDragColunaId(null);
    await fetch(`/api/projetos/${board.id}/colunas`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ordem: ids }),
    }).catch(() => {});
    onRecarregar();
  }

  function criarTarefa(colunaId: string) {
    const titulo = novoTitulo.trim();
    if (!titulo) return;
    // Otimista: o cartão aparece NA HORA com id temporário; o POST roda em
    // segundo plano e troca o id pelo real (falhou → recarrega e o temp some).
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const coluna = board.colunas.find((c) => c.id === colunaId);
    const ultima = porColuna(colunaId).slice(-1)[0];
    onInserirLocal({
      id: tempId, projetoId: board.id, colunaId, titulo,
      ordem: (ultima?.ordem ?? 0) + 1024,
      prioridade: "MEDIA", prazo: null, dataInicio: null,
      concluidaEm: coluna?.concluiTarefa ? new Date().toISOString() : null,
      arquivada: false, temDescricao: false,
      membros: [], etiquetas: [], checklistFeitos: 0, checklistTotal: 0,
      _count: { comentarios: 0, anexos: 0, checklist: 0 },
    });
    setNovoTitulo("");
    inputRef.current?.focus();
    fetch(`/api/projetos/${board.id}/tarefas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ colunaId, titulo }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((j) => {
        if (j?.data?.id) onAtualizarLocal(tempId, { id: j.data.id });
        else onRecarregar();
      })
      .catch(() => onRecarregar());
  }

  async function criarColuna() {
    const nome = novaColunaNome.trim();
    if (!nome) return;
    setNovaColuna(false); setNovaColunaNome("");
    await fetch(`/api/projetos/${board.id}/colunas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome }),
    }).catch(() => {});
    onRecarregar();
  }

  async function acaoColuna(colunaId: string, patch: Record<string, unknown>) {
    setMenuColuna(null);
    const res = await fetch(`/api/projetos/${board.id}/colunas/${colunaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (res && !res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(json.error || "Não foi possível alterar a coluna.");
    }
    onRecarregar();
  }

  return (
    <div className="flex items-start gap-4 px-6 py-4 h-full overflow-x-auto">
      {board.colunas.map((coluna) => {
        const lista = porColuna(coluna.id);
        return (
          <div
            key={coluna.id}
            className={cn(
              "w-72 shrink-0 bg-muted/60 rounded-xl border border-border flex flex-col max-h-full",
              dragColunaId === coluna.id && "opacity-50"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragTarefaId && lista.length === 0) setDropAlvo({ colunaId: coluna.id, aposTarefaId: null });
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragTarefaId) soltarCartao();
              else if (dragColunaId) soltarColuna(coluna.id);
            }}
          >
            {/* Cabeçalho da coluna */}
            <div
              className="relative flex items-center gap-2 px-3 py-2.5 shrink-0"
              draggable={podeGerenciar}
              onDragStart={() => setDragColunaId(coluna.id)}
              onDragEnd={() => setDragColunaId(null)}
            >
              {podeGerenciar && <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 cursor-grab" />}
              {coluna.cor && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: coluna.cor }} />}
              <span className="font-semibold text-sm text-foreground truncate">{coluna.nome}</span>
              {coluna.concluiTarefa && <Check className="w-3.5 h-3.5 text-success" />}
              <span className="text-xs text-muted-foreground">{lista.length}</span>
              {podeGerenciar && (
                <button
                  onClick={() => setMenuColuna(menuColuna === coluna.id ? null : coluna.id)}
                  className="ml-auto p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              )}

              {/* Menu da coluna — popover FLUTUANTE por cima do board (estilo
                  Trello), sem empurrar os cartões para baixo. */}
              {menuColuna === coluna.id && (
                <>
                  <div className="fixed inset-0 z-40" onMouseDown={() => setMenuColuna(null)} />
                  {/* À DIREITA da coluna (não por cima dos cartões), como no Trello. */}
                  <div className="absolute left-full top-1 ml-1.5 z-50 w-64 bg-card border border-border rounded-xl shadow-xl text-sm overflow-hidden">
                    <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
                      <span className="w-4" />
                      <span className="text-xs font-semibold text-muted-foreground">Ações da lista</span>
                      <button onClick={() => setMenuColuna(null)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    <button
                      className="w-full text-left px-3 py-2 hover:bg-muted"
                      onClick={() => { setMenuColuna(null); setNovaTarefaCol(coluna.id); setNovoTitulo(""); }}
                    >
                      Adicionar cartão
                    </button>
                    <button
                      className="w-full text-left px-3 py-2 hover:bg-muted"
                      onClick={() => {
                        const nome = window.prompt("Novo nome da coluna:", coluna.nome);
                        if (nome?.trim()) acaoColuna(coluna.id, { nome: nome.trim() });
                        else setMenuColuna(null);
                      }}
                    >
                      Renomear
                    </button>
                    <button className="w-full text-left px-3 py-2 hover:bg-muted" onClick={() => acaoColuna(coluna.id, { concluiTarefa: !coluna.concluiTarefa })}>
                      {coluna.concluiTarefa ? "Deixar de concluir tarefas" : "Marcar como coluna de conclusão"}
                    </button>
                    <button className="w-full text-left px-3 py-2 text-danger hover:bg-danger/10" onClick={() => acaoColuna(coluna.id, { arquivada: true })}>
                      Arquivar coluna
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Cartões */}
            <div className="px-2 pb-2 space-y-2 overflow-y-auto flex-1 min-h-[6px]">
              {lista.map((t, idx) => {
                const prazo = prazoInfo(t.prazo, !!t.concluidaEm);
                return (
                  <div key={t.id}>
                    {/* Zona de drop ANTES do cartão */}
                    {dragTarefaId && dragTarefaId !== t.id && (
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDropAlvo({ colunaId: coluna.id, aposTarefaId: idx === 0 ? null : lista[idx - 1].id });
                        }}
                        onDrop={(e) => { e.preventDefault(); soltarCartao(); }}
                        className={cn(
                          "h-1.5 rounded transition-all",
                          dropAlvo?.colunaId === coluna.id && dropAlvo.aposTarefaId === (idx === 0 ? null : lista[idx - 1].id)
                            ? "h-8 bg-info/15 border border-dashed border-info/50 mb-2"
                            : ""
                        )}
                      />
                    )}
                    <div
                      draggable={podeEditar}
                      onDragStart={(e) => { e.stopPropagation(); setDragTarefaId(t.id); }}
                      onDragEnd={() => { setDragTarefaId(null); setDropAlvo(null); }}
                      onClick={() => { if (!t.id.startsWith("temp-")) onAbrirTarefa(t.id); }}
                      onMouseEnter={(e) => { hoverRef.current = { tarefa: t, el: e.currentTarget }; }}
                      onMouseLeave={() => { if (hoverRef.current?.tarefa.id === t.id) hoverRef.current = null; }}
                      className={cn(
                        "group/card relative bg-card rounded-lg border border-border p-2.5 shadow-sm cursor-pointer hover:border-blue-400 transition-colors",
                        dragTarefaId === t.id && "opacity-40",
                        t.concluidaEm && "opacity-70"
                      )}
                    >
                      {podeEditar && (
                        <button
                          onClick={(e) => { e.stopPropagation(); abrirQuickEdit(t, (e.currentTarget as HTMLElement).closest(".group\\/card") as HTMLElement); }}
                          className="absolute top-1.5 right-1.5 z-10 p-1.5 rounded-md bg-card/90 border border-border text-muted-foreground opacity-0 group-hover/card:opacity-100 hover:text-foreground hover:bg-muted transition-opacity"
                          title="Editar cartão (e)"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                      {t.etiquetas.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {t.etiquetas.map((e) => <EtiquetaChip key={e.id} etiqueta={e} small />)}
                        </div>
                      )}
                      <div className="flex items-start gap-1.5">
                        {podeEditar && temColunaConclui && (
                          <button
                            onClick={(e) => { e.stopPropagation(); concluirRapido(t); }}
                            className={cn(
                              "shrink-0 mt-0.5 transition-all",
                              t.concluidaEm ? "text-success" : "text-muted-foreground/50 hover:text-success w-0 opacity-0 group-hover/card:w-4 group-hover/card:opacity-100"
                            )}
                            title={t.concluidaEm ? "Reabrir" : "Concluir"}
                          >
                            {t.concluidaEm ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                          </button>
                        )}
                        <p className={cn("text-sm text-foreground leading-snug flex-1", t.concluidaEm && "line-through text-muted-foreground")}>
                          {t.titulo}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <PrioridadeBadge prioridade={t.prioridade} small />
                        {prazo && (
                          <span className={cn(
                            "inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md",
                            t.concluidaEm ? "bg-success/15 text-success" :
                            prazo.cls.includes("text-danger") ? "bg-danger/15 text-danger font-semibold" :
                            prazo.cls.includes("text-warning") ? "bg-warning/15 text-warning font-semibold" :
                            "text-muted-foreground"
                          )}>
                            <Clock className="w-3 h-3" /> {prazo.label}
                          </span>
                        )}
                        {t.temDescricao && <AlignLeft className="w-3 h-3 text-muted-foreground" />}
                        {t.checklistTotal > 0 && (
                          <span className={cn("inline-flex items-center gap-0.5 text-[11px]", t.checklistFeitos === t.checklistTotal ? "text-success" : "text-muted-foreground")}>
                            <CheckSquare className="w-3 h-3" /> {t.checklistFeitos}/{t.checklistTotal}
                          </span>
                        )}
                        {t._count.anexos > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground"><Paperclip className="w-3 h-3" /> {t._count.anexos}</span>
                        )}
                        {t._count.comentarios > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground"><MessageSquare className="w-3 h-3" /> {t._count.comentarios}</span>
                        )}
                        {t.membros.length > 0 && (
                          <span className="ml-auto flex -space-x-1">
                            {t.membros.slice(0, 3).map((m) => <AvatarUsuario key={m.id} nome={m.nome} size="sm" />)}
                            {t.membros.length > 3 && (
                              <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground text-[9px] font-semibold inline-flex items-center justify-center">
                                +{t.membros.length - 3}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* Zona de drop no FIM da coluna */}
              {dragTarefaId && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropAlvo({ colunaId: coluna.id, aposTarefaId: lista.filter((t) => t.id !== dragTarefaId).slice(-1)[0]?.id ?? null });
                  }}
                  onDrop={(e) => { e.preventDefault(); soltarCartao(); }}
                  className={cn(
                    "rounded transition-all",
                    dropAlvo?.colunaId === coluna.id && dropAlvo.aposTarefaId === (lista.filter((t) => t.id !== dragTarefaId).slice(-1)[0]?.id ?? null)
                      ? "h-8 bg-info/15 border border-dashed border-info/50"
                      : "h-6"
                  )}
                />
              )}
            </div>

            {/* Adicionar tarefa inline */}
            {podeEditar && (
              <div className="px-2 pb-2 shrink-0">
                {novaTarefaCol === coluna.id ? (
                  <div>
                    {/* Composer estilo Trello: o campo já parece um cartão */}
                    <textarea
                      ref={inputRef}
                      autoFocus
                      value={novoTitulo}
                      onChange={(e) => setNovoTitulo(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); criarTarefa(coluna.id); }
                        if (e.key === "Escape") { setNovaTarefaCol(null); setNovoTitulo(""); }
                      }}
                      onBlur={() => { if (!novoTitulo.trim()) setNovaTarefaCol(null); }}
                      rows={2}
                      placeholder="Insira um título ou cole um link"
                      className="w-full text-sm bg-card text-foreground rounded-lg border border-border shadow-sm px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-muted-foreground"
                    />
                    <div className="flex items-center gap-2 mt-1.5">
                      <Button size="sm" className="h-8 px-3 text-sm bg-blue-600 hover:bg-blue-700" onClick={() => criarTarefa(coluna.id)}>
                        Adicionar cartão
                      </Button>
                      <button
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                        onClick={() => { setNovaTarefaCol(null); setNovoTitulo(""); }}
                        title="Cancelar"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setNovaTarefaCol(coluna.id); setNovoTitulo(""); }}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Adicionar um cartão
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Nova coluna */}
      {podeGerenciar && (
        <div className="w-72 shrink-0">
          {novaColuna ? (
            <div className="bg-card rounded-xl border border-info/40 p-3 space-y-2">
              <EscClose onClose={() => setNovaColuna(false)} />
              <Label className="text-xs">Nome da coluna</Label>
              <Input
                autoFocus
                value={novaColunaNome}
                onChange={(e) => setNovaColunaNome(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && criarColuna()}
                placeholder="Ex.: Aguardando peça"
              />
              <div className="flex gap-1.5">
                <Button size="sm" className="h-7 px-2.5 text-xs bg-blue-600 hover:bg-blue-700" onClick={criarColuna}>Criar</Button>
                <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setNovaColuna(false)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setNovaColuna(true); setNovaColunaNome(""); }}
              onDragOver={(e) => { if (dragColunaId) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); if (dragColunaId) soltarColuna(null); }}
              className="w-full flex items-center gap-1.5 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted rounded-xl border border-dashed border-border transition-colors"
            >
              <Plus className="w-4 h-4" /> Nova coluna
            </button>
          )}
        </div>
      )}

      {/* Edição rápida do cartão */}
      {quickEdit && (
        <TarefaQuickEdit
          tarefa={quickEdit.tarefa}
          board={board}
          rect={quickEdit.rect}
          submenuInicial={quickEdit.submenu ?? null}
          onFechar={() => setQuickEdit(null)}
          onAbrir={() => onAbrirTarefa(quickEdit.tarefa.id)}
          onMudou={onRecarregar}
        />
      )}
    </div>
  );
}
