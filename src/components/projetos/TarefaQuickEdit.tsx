"use client";

// Edição rápida do cartão (estilo Trello): overlay sobre o próprio cartão com
// o título editável + menu de ações contextuais ao lado. Abre pelo lápis no
// hover ou pela tecla "e" com o mouse sobre o cartão.
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import DatePicker from "@/components/shared/DatePicker";
import EscClose from "@/components/shared/EscClose";
import {
  CreditCard, User as UserIcon, CalendarDays, ArrowRight, Copy, Link as LinkIcon, Archive, Check,
} from "lucide-react";
import { ProjetoBoardDTO, TarefaResumoDTO } from "./tipos";

type Submenu = null | "membros" | "prazo" | "mover";

export default function TarefaQuickEdit({
  tarefa, board, rect, onFechar, onAbrir, onMudou,
}: {
  tarefa: TarefaResumoDTO;
  board: ProjetoBoardDTO;
  rect: { top: number; left: number; width: number; right: number };
  onFechar: () => void;
  onAbrir: () => void;
  onMudou: () => void;
}) {
  const [titulo, setTitulo] = useState(tarefa.titulo);
  const [submenu, setSubmenu] = useState<Submenu>(null);
  const [copiado, setCopiado] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    taRef.current?.focus();
    taRef.current?.select();
  }, []);

  async function patch(data: Record<string, unknown>, fecha = true) {
    await fetch(`/api/projetos/tarefas/${tarefa.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => {});
    onMudou();
    if (fecha) onFechar();
  }

  async function salvarTitulo() {
    const t = titulo.trim();
    if (t && t !== tarefa.titulo) await patch({ titulo: t });
    else onFechar();
  }

  async function mover(colunaId: string) {
    await fetch(`/api/projetos/tarefas/${tarefa.id}/mover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ colunaId }),
    }).catch(() => {});
    onMudou();
    onFechar();
  }

  async function copiarCartao() {
    await fetch(`/api/projetos/tarefas/${tarefa.id}/copiar`, { method: "POST" }).catch(() => {});
    onMudou();
    onFechar();
  }

  async function copiarLink() {
    const url = `${window.location.origin}/projetos/${board.id}?tarefa=${tarefa.id}`;
    try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(onFechar, 700); }
    catch { onFechar(); }
  }

  // Menu à direita do cartão; se não couber, vai para a esquerda.
  const MENU_W = 200;
  const menuEsquerda = rect.right + 8 + MENU_W > window.innerWidth;
  const menuStyle = menuEsquerda
    ? { top: rect.top, right: window.innerWidth - rect.left + 8 }
    : { top: rect.top, left: rect.right + 8 };

  const acoes: Array<{ icone: React.ReactNode; label: string; onClick: () => void; submenu?: Submenu; danger?: boolean }> = [
    { icone: <CreditCard className="w-3.5 h-3.5" />, label: "Abrir cartão", onClick: () => { onFechar(); onAbrir(); } },
    { icone: <UserIcon className="w-3.5 h-3.5" />, label: "Alterar membros", onClick: () => setSubmenu(submenu === "membros" ? null : "membros"), submenu: "membros" },
    { icone: <CalendarDays className="w-3.5 h-3.5" />, label: "Editar prazo", onClick: () => setSubmenu(submenu === "prazo" ? null : "prazo"), submenu: "prazo" },
    { icone: <ArrowRight className="w-3.5 h-3.5" />, label: "Mover", onClick: () => setSubmenu(submenu === "mover" ? null : "mover"), submenu: "mover" },
    { icone: <Copy className="w-3.5 h-3.5" />, label: "Copiar cartão", onClick: copiarCartao },
    { icone: copiado ? <Check className="w-3.5 h-3.5 text-success" /> : <LinkIcon className="w-3.5 h-3.5" />, label: copiado ? "Link copiado!" : "Copiar link", onClick: copiarLink },
    { icone: <Archive className="w-3.5 h-3.5" />, label: "Arquivar", onClick: () => patch({ arquivada: true }), danger: true },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[70] bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) salvarTitulo(); }}
    >
      <EscClose onClose={onFechar} />

      {/* Cartão editável, na posição original */}
      <div className="fixed" style={{ top: rect.top, left: rect.left, width: rect.width }}>
        <div className="bg-card rounded-lg border border-info/50 shadow-xl p-2.5">
          {tarefa.etiquetas.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {tarefa.etiquetas.map((e) => (
                <span key={e.id} className="inline-flex px-1.5 py-px text-[10px] font-medium text-white rounded-full" style={{ backgroundColor: e.cor }}>
                  {e.nome}
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={taRef}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); salvarTitulo(); } }}
            rows={2}
            className="w-full text-sm bg-transparent text-foreground resize-none focus:outline-none"
          />
        </div>
        <Button size="sm" onClick={salvarTitulo} className="mt-2 bg-blue-600 hover:bg-blue-700 h-8 px-3 text-sm">
          Salvar
        </Button>
      </div>

      {/* Menu de ações contextuais */}
      <div className="fixed flex flex-col gap-1 items-stretch" style={{ ...menuStyle, width: MENU_W }}>
        {acoes.map((a) => (
          <div key={a.label}>
            <button
              onClick={a.onClick}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-1.5 text-[13px] rounded-lg bg-card border border-border shadow-md text-left transition-colors",
                a.danger ? "text-danger hover:bg-danger/10" : "text-foreground hover:bg-muted"
              )}
            >
              {a.icone} {a.label}
            </button>
            {submenu === "membros" && a.submenu === "membros" && (
              <div className="mt-1 bg-card border border-border rounded-lg shadow-md p-1 max-h-52 overflow-y-auto">
                {board.membros.map((m) => {
                  const marcado = tarefa.membros.some((x) => x.id === m.usuarioId);
                  return (
                    <button
                      key={m.usuarioId}
                      className={cn("w-full flex items-center gap-2 text-left px-2 py-1.5 text-[13px] rounded-md hover:bg-muted", marcado ? "text-info font-medium" : "text-foreground")}
                      onClick={() => {
                        const atuais = tarefa.membros.map((x) => x.id);
                        const novos = marcado ? atuais.filter((i) => i !== m.usuarioId) : [...atuais, m.usuarioId];
                        patch({ membroIds: novos });
                      }}
                    >
                      <span className="flex-1 truncate">{m.usuario.nome}</span>
                      {marcado && <Check className="w-3.5 h-3.5" />}
                    </button>
                  );
                })}
              </div>
            )}
            {submenu === "prazo" && a.submenu === "prazo" && (
              <div className="mt-1 bg-card border border-border rounded-lg shadow-md p-2 space-y-1.5">
                <DatePicker value={tarefa.prazo ? tarefa.prazo.slice(0, 10) : ""} onChange={(v) => patch({ prazo: v || null })} />
                {tarefa.prazo && (
                  <button className="w-full text-left px-1 text-xs text-muted-foreground hover:text-danger" onClick={() => patch({ prazo: null })}>
                    Remover prazo
                  </button>
                )}
              </div>
            )}
            {submenu === "mover" && a.submenu === "mover" && (
              <div className="mt-1 bg-card border border-border rounded-lg shadow-md p-1">
                {board.colunas.map((c) => (
                  <button
                    key={c.id}
                    className={cn("w-full text-left px-2 py-1.5 text-[13px] rounded-md hover:bg-muted", c.id === tarefa.colunaId ? "text-muted-foreground" : "text-foreground")}
                    disabled={c.id === tarefa.colunaId}
                    onClick={() => mover(c.id)}
                  >
                    {c.nome}{c.concluiTarefa ? " ✓" : ""}{c.id === tarefa.colunaId ? " (atual)" : ""}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
