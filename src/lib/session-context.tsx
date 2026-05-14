"use client";

import { createContext, useContext, useState, ReactNode } from "react";

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

  function canAccess(modulo: string): boolean {
    if (!user) return false;
    if (user.perfil === "ADMIN") return true;
    if (user.modulos.includes("*")) return true;
    // Suporta tanto o formato antigo ("comercial") quanto granular ("comercial.clientes.ver")
    return user.modulos.some((m) => m === modulo || m.startsWith(modulo + "."));
  }

  function refresh() {
    setLoading(true);
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => { if (d.user) setUser(d.user); })
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
