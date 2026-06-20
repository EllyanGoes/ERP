"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type SessionUser = {
  id: string;
  nome: string;
  email: string;
  perfil: "ADMIN" | "USUARIO";
  modulos: string[];
  // Multiempresa (Fase 3) — opcionais até o refresh povoar
  empresas?: { id: string; nome: string; slug: string | null }[];
  activeEmpresaId?: string;
};

type SessionContextType = {
  user: SessionUser | null;
  loading: boolean;
  canAccess: (modulo: string) => boolean;
  refresh: () => void;
};

const SessionContext = createContext<SessionContextType>({
  user: null,
  loading: true,
  canAccess: () => false,
  refresh: () => {},
});

export function SessionProvider({ children, initial }: { children: ReactNode; initial: SessionUser | null }) {
  const [user, setUser] = useState<SessionUser | null>(initial);
  const [loading, setLoading] = useState(false);

  // ── Auto-refresh: mount + foco da janela + a cada 5 min ───────────────────
  // Reemite o cookie com permissões atuais e mantém a sessão "viva". Também é o
  // ponto em que um dispositivo DESLOGADO remotamente percebe a revogação: o
  // refresh responde 401 → manda para o /login.
  useEffect(() => {
    if (!initial) return; // not logged in — nothing to refresh
    let parado = false;
    async function doRefresh() {
      try {
        const r = await fetch("/api/auth/refresh", { method: "POST" });
        if (r.status === 401) {
          // Sessão encerrada (revogada/expirada) → sai deste dispositivo.
          if (!parado) window.location.href = "/login";
          return;
        }
        const d = await r.json().catch(() => null);
        if (d?.user && !parado) setUser(d.user);
      } catch { /* non-blocking — ignore network errors */ }
    }
    doRefresh();
    const onFocus = () => doRefresh();
    const onVis = () => { if (document.visibilityState === "visible") doRefresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    const id = setInterval(doRefresh, 5 * 60_000);
    return () => {
      parado = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(id);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function canAccess(modulo: string): boolean {
    if (!user) return false;
    if (user.perfil === "ADMIN") return true;
    if (user.modulos.includes("*")) return true;
    // Supports both legacy format ("comercial") and granular ("comercial.clientes.ver")
    return user.modulos.some((m) => m === modulo || m.startsWith(modulo + "."));
  }

  // Manual refresh — re-fetches from DB and reissues cookie
  function refresh() {
    setLoading(true);
    fetch("/api/auth/refresh", { method: "POST" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.user) setUser(d.user); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  return (
    <SessionContext.Provider value={{ user, loading, canAccess, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
