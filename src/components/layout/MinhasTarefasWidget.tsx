"use client";

// Caixinha "Minhas Tarefas" no topo (ao lado do sino): badge com o nº de
// tarefas atrasadas/para hoje e popover com a lista rápida. Só aparece para
// quem tem o módulo projetos.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox, AlertTriangle } from "lucide-react";
import { useSession } from "@/lib/session-context";
import { cn } from "@/lib/utils";
import { prazoInfo, EtiquetaDTO } from "@/components/projetos/tipos";

type MinhaTarefaDTO = {
  id: string;
  titulo: string;
  prioridade: string;
  prazo: string | null;
  projeto: { id: string; nome: string; cor: string | null };
  coluna: { nome: string };
  etiquetas: EtiquetaDTO[];
};

export default function MinhasTarefasWidget() {
  const router = useRouter();
  const { user, canAccess } = useSession();
  const [tarefas, setTarefas] = useState<MinhaTarefaDTO[]>([]);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const temModulo = !!user && canAccess("projetos");

  const load = useCallback(async () => {
    if (!temModulo) return;
    try {
      const res = await fetch("/api/projetos/minhas-tarefas");
      if (!res.ok) return;
      const json = await res.json();
      setTarefas(json.data ?? []);
    } catch {}
  }, [temModulo]);

  // Carrega ao montar, ao focar a janela e a cada 5 min (mesmo espírito do sino)
  useEffect(() => {
    if (!temModulo) return;
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    const id = setInterval(load, 5 * 60_000);
    return () => { window.removeEventListener("focus", onFocus); clearInterval(id); };
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
    function esc(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", clickFora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", clickFora);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!temModulo) return null;

  const hoje = new Date(); hoje.setHours(23, 59, 59, 999);
  const urgentes = tarefas.filter((t) => t.prazo && new Date(t.prazo) <= hoje).length;

  function abrir(t: MinhaTarefaDTO) {
    setOpen(false);
    router.push(`/projetos/${t.projeto.id}?tarefa=${t.id}`);
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        title="Minhas Tarefas"
        aria-label="Minhas Tarefas"
      >
        <Inbox className="w-[18px] h-[18px]" />
        {urgentes > 0 && (
          <span className="absolute -top-1 -right-1 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-danger px-[3px] text-[9px] font-bold leading-none text-white ring-1 ring-background tabular-nums">
            {urgentes > 9 ? "9+" : urgentes}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-2 w-80 max-h-[70vh] overflow-hidden rounded-xl border border-border bg-card shadow-lg z-50 flex flex-col"
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <span className="text-sm font-semibold text-foreground">Minhas Tarefas</span>
            {urgentes > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-danger font-medium">
                <AlertTriangle className="w-3.5 h-3.5" /> {urgentes} com prazo
              </span>
            )}
          </div>

          <div className="overflow-y-auto flex-1 divide-y divide-border">
            {tarefas.length === 0 && (
              <p className="px-4 py-8 text-center text-xs text-muted-foreground">Nenhuma tarefa atribuída a você. 🎉</p>
            )}
            {tarefas.slice(0, 12).map((t) => {
              const prazo = prazoInfo(t.prazo, false);
              return (
                <button
                  key={t.id}
                  onClick={() => abrir(t)}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-muted transition-colors"
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.projeto.cor ?? "#64748b" }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-foreground truncate">{t.titulo}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">{t.projeto.nome} · {t.coluna.nome}</span>
                  </span>
                  {prazo && <span className={cn("text-[11px] whitespace-nowrap shrink-0", prazo.cls)}>{prazo.label}</span>}
                </button>
              );
            })}
            {tarefas.length > 12 && (
              <p className="px-4 py-2 text-center text-[11px] text-muted-foreground">+{tarefas.length - 12} tarefas</p>
            )}
          </div>

          <button
            onClick={() => { setOpen(false); router.push("/projetos/minhas-tarefas"); }}
            className="px-4 py-2.5 text-sm text-info hover:bg-muted border-t border-border font-medium"
          >
            Ver todas
          </button>
        </div>
      )}
    </div>
  );
}
