"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck, X } from "lucide-react";
import { useSession } from "@/lib/session-context";

type Notif = {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  link: string | null;
  lida: boolean;
  createdAt: string;
};

const POLL_MS = 25_000;

function tempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} d`;
}

export default function NotificationCenter() {
  const router = useRouter();
  const { user } = useSession();
  const userId = user?.id ?? "anon";

  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [open, setOpen] = useState(false);
  const [aba, setAba] = useState<"pendentes" | "vistas">("pendentes");
  const [toasts, setToasts] = useState<Notif[]>([]);
  const [mounted, setMounted] = useState(false);

  const lastSeenRef = useRef(0);
  const seededRef = useRef(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    lastSeenRef.current = Number(localStorage.getItem(`notif:lastSeen:${userId}`) || 0);
    seededRef.current = false;
  }, [userId]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Permissão para notificações nativas do SO (macOS/Windows). Pede no 1º clique
  // do sino (gesto do usuário — exigido pelos navegadores).
  const pedirPermissaoNativa = useCallback(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Dispara a notificação do SISTEMA. Só quando a janela do app NÃO está focada
  // (aba em 2º plano OU usuário em outro aplicativo — com a aba ativa e focada
  // basta o toast in-app), e com permissão concedida.
  const dispararNativa = useCallback((n: Notif) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted" || document.hasFocus()) return;
    try {
      const nativa = new Notification(n.titulo, { body: n.mensagem, tag: n.id });
      nativa.onclick = () => {
        window.focus();
        if (n.link) router.push(n.link);
        nativa.close();
      };
    } catch { /* ignore */ }
  }, [router]);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/notificacoes");
      if (!res.ok) return;
      const json = await res.json();
      const list: Notif[] = json.data ?? [];
      setNotifs(list);
      setNaoLidas(json.naoLidas ?? 0);
      if (!list.length) return;

      const maisRecente = new Date(list[0].createdAt).getTime();
      const key = `notif:lastSeen:${userId}`;
      if (!seededRef.current) {
        // Primeira carga: não estoura toasts do histórico, só marca o ponto atual.
        seededRef.current = true;
        lastSeenRef.current = maisRecente;
        localStorage.setItem(key, String(maisRecente));
        return;
      }
      const novas = list.filter((n) => new Date(n.createdAt).getTime() > lastSeenRef.current && !n.lida);
      if (novas.length) {
        novas.forEach(dispararNativa); // notificação do SO (aba em 2º plano)
        setToasts((prev) => [...[...novas].reverse(), ...prev].slice(0, 4));
        lastSeenRef.current = maisRecente;
        localStorage.setItem(key, String(maisRecente));
      }
    } catch {
      /* silencioso */
    }
  }, [userId, dispararNativa]);

  useEffect(() => {
    if (!user) return;
    poll();
    const t = setInterval(poll, POLL_MS);
    const onFocus = () => poll();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [user, poll]);

  // Auto-dismiss dos toasts (macOS some sozinho).
  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map((t) => setTimeout(() => dismissToast(t.id), 6500));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismissToast]);

  // Fecha o painel ao clicar fora.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        panelRef.current && !panelRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function marcarLidas(ids?: string[]) {
    try {
      await fetch("/api/notificacoes/marcar-lidas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids ? { ids } : {}),
      });
    } catch { /* ignore */ }
    setNotifs((prev) => prev.map((n) => (!ids || ids.includes(n.id) ? { ...n, lida: true } : n)));
    setNaoLidas((c) => (ids ? Math.max(0, c - ids.length) : 0));
  }

  function abrir(n: Notif) {
    dismissToast(n.id);
    if (!n.lida) marcarLidas([n.id]);
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  const pendentes = notifs.filter((n) => !n.lida);
  const vistas = notifs.filter((n) => n.lida);
  const lista = aba === "pendentes" ? pendentes : vistas;

  return (
    <>
      <div className="relative">
        <button
          ref={btnRef}
          onClick={() => { pedirPermissaoNativa(); setOpen((o) => !o); if (!open && naoLidas) poll(); }}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Notificações"
          aria-label="Notificações"
        >
          <Bell className="w-[18px] h-[18px]" />
          {naoLidas > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center">
              {naoLidas > 9 ? "9+" : naoLidas}
            </span>
          )}
        </button>

        {open && (
          <div
            ref={panelRef}
            className="absolute right-0 top-full mt-2 w-80 max-h-[70vh] overflow-hidden rounded-xl border border-border bg-card shadow-lg z-50 flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <span className="text-sm font-semibold text-foreground">Notificações</span>
              {naoLidas > 0 && (
                <button onClick={() => marcarLidas()} className="text-xs text-info hover:underline inline-flex items-center gap-1">
                  <CheckCheck className="w-3.5 h-3.5" /> Marcar todas
                </button>
              )}
            </div>
            {/* Abas: pendentes (não lidas) × vistas (já lidas) */}
            <div className="flex items-center gap-1 px-2 pt-2 border-b border-border">
              {([["pendentes", "Pendentes", pendentes.length], ["vistas", "Vistas", vistas.length]] as const).map(([k, label, count]) => (
                <button
                  key={k}
                  onClick={() => setAba(k)}
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors ${
                    aba === k ? "text-foreground border-b-2 border-info -mb-px" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                  <span className={`inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full text-[10px] font-semibold ${
                    k === "pendentes" && count > 0 ? "bg-info/15 text-info" : "bg-muted text-muted-foreground"
                  }`}>
                    {count}
                  </span>
                </button>
              ))}
            </div>
            <div className="overflow-y-auto">
              {lista.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {aba === "pendentes" ? "Nenhuma notificação pendente." : "Nenhuma notificação vista."}
                </p>
              ) : (
                lista.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => abrir(n)}
                    className={`w-full text-left px-4 py-3 border-b border-border/60 hover:bg-muted transition-colors ${n.lida ? "" : "bg-info/5"}`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.lida && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-info" />}
                      <div className={`min-w-0 flex-1 ${n.lida ? "pl-4" : ""}`}>
                        <p className="text-sm font-medium text-foreground">{n.titulo}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.mensagem}</p>
                        <p className="text-[11px] text-muted-foreground/70 mt-1">{tempoRelativo(n.createdAt)}</p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Toaster estilo macOS — canto superior direito */}
      {mounted && createPortal(
        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[340px] max-w-[calc(100vw-2rem)]">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="group rounded-2xl border border-border bg-card/95 backdrop-blur shadow-xl px-4 py-3 animate-in slide-in-from-right-4 fade-in cursor-pointer"
              onClick={() => abrir(t)}
              role="alert"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-info/15 text-info">
                  <Check className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{t.titulo}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-3">{t.mensagem}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); dismissToast(t.id); }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                  aria-label="Fechar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
