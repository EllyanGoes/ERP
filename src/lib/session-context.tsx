"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type SessionUser = {
  id: string;
  nome: string;
  email: string;
  perfil: "ADMIN" | "USUARIO";
  modulos: string[];
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

  // ── Auto-refresh on mount ─────────────────────────────────────────────────
  // Silently reissues the JWT cookie with up-to-date permissions from the DB.
  // This fixes stale tokens when permissions are changed after the user logged in.
  useEffect(() => {
    if (!initial) return; // not logged in — nothing to refresh
    fetch("/api/auth/refresh", { method: "POST" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.user) setUser(d.user); })
      .catch(() => { /* non-blocking — ignore network errors */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

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
