"use client";

// Menu do usuário no canto superior direito (Minha Conta, Dispositivos,
// Configurações, tema, atalhos e Sair). Antes ficava no rodapé da faixa lateral.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ChevronRight, HelpCircle, LogOut, Monitor, Moon, Settings, ShieldCheck, Sun, User } from "lucide-react";
import { useDirtyFormContext } from "@/lib/dirty-form-context";
import { useSession } from "@/lib/session-context";
import { useShortcuts } from "@/lib/shortcuts-context";
import { cn } from "@/lib/utils";

export default function UserMenu() {
  const { user } = useSession();
  const { openShortcuts } = useShortcuts();
  const userInitials = user?.nome
    ? user.nome.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
    : "?";
  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  // O painel de Configurações vive na barra lateral: pede para ela abrir.
  const onConfiguracoes = () => window.dispatchEvent(new Event("sidebar:abrir-configuracoes"));
  const onAtalhos = openShortcuts;

  const { resolvedTheme, setTheme } = useTheme();
  const escuro = resolvedTheme === "dark";
  const btnRef   = useRef<HTMLButtonElement>(null);
  const dropRef  = useRef<HTMLDivElement>(null);
  const [open, setOpen]     = useState(false);
  const [pos, setPos]       = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  const { attemptNavigate } = useDirtyFormContext();
  const router = useRouter();

  useEffect(() => { setMounted(true); }, []);

  function handleToggle() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    // Abre para baixo, alinhado à direita do avatar (canto superior direito).
    setPos({ top: r.bottom + 6, left: Math.max(8, r.right - 224) });
    setOpen((p) => !p);
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const isAdmin = user?.perfil === "ADMIN";

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleToggle}
        title={user ? `${user.nome} · ${user.email}` : "Usuário"}
        className={cn(
          "flex items-center justify-center w-9 h-9 rounded-lg transition-colors",
          open ? "bg-muted" : "hover:bg-muted"
        )}
        aria-label="Menu do usuário"
      >
        <div className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold select-none",
          isAdmin ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-foreground"
        )}>
          {userInitials}
        </div>
      </button>

      {mounted && open && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[9999] w-56 rounded-xl bg-popover text-popover-foreground border border-border shadow-[0_8px_32px_rgba(0,0,0,0.14)] overflow-hidden"
          style={{ top: pos.top, left: pos.left }}
        >
          {/* User info */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <div className={cn(
              "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
              isAdmin ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
            )}>
              {userInitials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{user?.nome ?? "—"}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email ?? "—"}</p>
              {isAdmin && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary mt-0.5">
                  <ShieldCheck className="w-3 h-3" /> Admin
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="py-1">
            <button
              onClick={() => { setOpen(false); attemptNavigate(() => router.push("/minha-conta")); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
            >
              <User className="w-4 h-4 text-muted-foreground" />
              Minha Conta
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 ml-auto" />
            </button>
            <button
              onClick={() => { setOpen(false); attemptNavigate(() => router.push("/conta/dispositivos")); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
            >
              <Monitor className="w-4 h-4 text-muted-foreground" />
              Dispositivos
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 ml-auto" />
            </button>
          </div>

          {/* Antes eram ícones soltos na faixa escura: agora ficam aqui. */}
          <div className="border-t border-border py-1">
            <button
              onClick={() => { setOpen(false); onConfiguracoes(); }}
              className={cn(
                "w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-muted transition-colors",
                "text-foreground",
              )}
            >
              <Settings className="w-4 h-4 text-muted-foreground" />
              Configurações
            </button>
            <button
              onClick={() => setTheme(escuro ? "light" : "dark")}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
            >
              {escuro ? <Sun className="w-4 h-4 text-muted-foreground" /> : <Moon className="w-4 h-4 text-muted-foreground" />}
              {escuro ? "Tema claro" : "Tema escuro"}
            </button>
            <button
              onClick={() => { setOpen(false); onAtalhos(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
            >
              <HelpCircle className="w-4 h-4 text-muted-foreground" />
              Atalhos do teclado
              <span className="ml-auto text-xs text-muted-foreground">?</span>
            </button>
          </div>

          <div className="border-t border-border py-1">
            <button
              onClick={() => { setOpen(false); onLogout(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
