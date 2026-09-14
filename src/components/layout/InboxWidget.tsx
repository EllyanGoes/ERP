"use client";

// Caixa de Entrada (Projetos) no topo, ao lado do sino — estilo Things 3:
// captura rápida de tarefas sem projeto, lista com bolinha p/ concluir e
// "mover para projeto". Badge = itens abertos. Só p/ quem tem o módulo.
// (Os avisos de prazo das tarefas atribuídas foram para o sino.)
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Circle, CheckCircle2, FolderInput, Plus } from "lucide-react";
import { useSession } from "@/lib/session-context";
import { cn } from "@/lib/utils";
import InboxMoverMenu, { InboxItemDTO, avisarInboxMudou } from "@/components/projetos/InboxMoverMenu";

export default function InboxWidget() {
  const router = useRouter();
  const { user, canAccess } = useSession();
  const [itens, setItens] = useState<InboxItemDTO[]>([]);
  const [open, setOpen] = useState(false);
  const [novo, setNovo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [concluindo, setConcluindo] = useState<string | null>(null);
  const [moverDe, setMoverDe] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const temModulo = !!user && canAccess("projetos");

  const load = useCallback(async () => {
    if (!temModulo) return;
    try {
      const res = await fetch("/api/projetos/inbox");
      if (!res.ok) return;
      const json = await res.json();
      setItens(json.data ?? []);
    } catch {}
  }, [temModulo]);

  // Carrega ao montar, ao focar a janela, a cada 5 min e quando a página da
  // caixa (ou o mover) avisa "erp:inbox-mudou".
  useEffect(() => {
    if (!temModulo) return;
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    window.addEventListener("erp:inbox-mudou", onFocus);
    const id = setInterval(load, 5 * 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("erp:inbox-mudou", onFocus);
      clearInterval(id);
    };
  }, [load, temModulo]);

  // Fecha ao clicar fora / ESC
  useEffect(() => {
    if (!open) return;
    function clickFora(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    function esc(e: KeyboardEvent) { if (e.key === "Escape" && !moverDe) setOpen(false); }
    document.addEventListener("mousedown", clickFora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", clickFora);
      document.removeEventListener("keydown", esc);
    };
  }, [open, moverDe]);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);

  if (!temModulo) return null;

  async function adicionar() {
    const titulo = novo.trim();
    if (!titulo || salvando) return;
    setSalvando(true);
    const res = await fetch("/api/projetos/inbox", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titulo }),
    }).catch(() => null);
    setSalvando(false);
    if (res?.ok) {
      const j = await res.json();
      setItens((prev) => [...prev, j.data]);
      setNovo("");
      avisarInboxMudou();
    }
  }

  async function concluir(item: InboxItemDTO) {
    setConcluindo(item.id);
    await fetch(`/api/projetos/inbox/${item.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ concluida: true }),
    }).catch(() => {});
    // Pequena pausa p/ a bolinha marcar antes de sumir (Things faz assim).
    setTimeout(() => { setItens((prev) => prev.filter((i) => i.id !== item.id)); setConcluindo(null); avisarInboxMudou(); }, 450);
  }

  const abertos = itens.length;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        title="Caixa de Entrada"
        aria-label="Caixa de Entrada"
      >
        <Inbox className="w-[18px] h-[18px]" />
        {abertos > 0 && (
          <span className="absolute -top-1 -right-1 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-info px-[3px] text-[9px] font-bold leading-none text-white ring-1 ring-background tabular-nums">
            {abertos > 9 ? "9+" : abertos}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-2 w-80 max-h-[70vh] overflow-hidden rounded-xl border border-border bg-card shadow-lg z-50 flex flex-col"
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <span className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5"><Inbox className="w-4 h-4 text-info" /> Caixa de Entrada</span>
            {abertos > 0 && <span className="text-xs text-muted-foreground">{abertos} {abertos === 1 ? "item" : "itens"}</span>}
          </div>

          {/* Captura rápida */}
          <div className="px-3 py-2 border-b border-border">
            <div className="flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5">
              <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                value={novo}
                onChange={(e) => setNovo(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionar(); } }}
                placeholder="Nova tarefa… (Enter)"
                className="flex-1 min-w-0 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {itens.length === 0 && (
              <p className="px-4 py-8 text-center text-xs text-muted-foreground">Caixa vazia. Anote aqui o que vier à cabeça e organize depois.</p>
            )}
            {itens.slice(0, 15).map((item) => {
              const marcado = concluindo === item.id;
              return (
                <div
                  key={item.id}
                  className="relative group flex items-start gap-2.5 px-4 py-2 hover:bg-muted transition-colors"
                >
                  <button
                    onClick={() => concluir(item)}
                    className={cn("mt-0.5 shrink-0 transition-colors", marcado ? "text-info" : "text-muted-foreground/50 hover:text-info")}
                    title="Concluir"
                  >
                    {marcado ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => { setOpen(false); router.push(`/projetos/caixa-de-entrada?item=${item.id}`); }}
                    className="flex-1 min-w-0 text-left"
                  >
                    <span className={cn("block text-sm truncate", marcado ? "text-muted-foreground line-through" : "text-foreground")}>{item.titulo}</span>
                    {item.notas && <span className="block text-[11px] text-muted-foreground truncate">{item.notas}</span>}
                  </button>
                  <button
                    onClick={() => setMoverDe(moverDe === item.id ? null : item.id)}
                    className={cn("shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-card", moverDe === item.id ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
                    title="Mover para projeto"
                  >
                    <FolderInput className="w-4 h-4" />
                  </button>
                  {moverDe === item.id && (
                    <InboxMoverMenu
                      itemId={item.id}
                      onFechar={() => setMoverDe(null)}
                      onMovido={(r) => { setMoverDe(null); setItens((prev) => prev.filter((i) => i.id !== item.id)); setOpen(false); router.push(`/projetos/${r.projetoId}?tarefa=${r.tarefaId}`); }}
                    />
                  )}
                </div>
              );
            })}
            {itens.length > 15 && (
              <p className="px-4 py-2 text-center text-[11px] text-muted-foreground">+{itens.length - 15} itens</p>
            )}
          </div>

          <button
            onClick={() => { setOpen(false); router.push("/projetos/caixa-de-entrada"); }}
            className="px-4 py-2.5 text-sm text-info hover:bg-muted border-t border-border font-medium"
          >
            Abrir caixa de entrada
          </button>
        </div>
      )}
    </div>
  );
}
