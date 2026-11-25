"use client";

// Preferências de interface por usuário (localStorage), com aviso entre
// componentes: mudar em Minha Conta reflete na barra lateral na hora.
// Lidas DEPOIS de montar (default no 1º render) p/ não dar mismatch de hidratação.
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/session-context";

const EVENTO = "ui-prefs:barra-modulos";
const chave = (userId: string) => `erp:ui:${userId}:barra-modulos`;

/** true = mostra a faixa de ícones dos módulos; false = troca de módulo pelo droplist no nome. */
export function useBarraModulos(): [boolean, (v: boolean) => void] {
  const { user } = useSession();
  const key = chave(user?.id ?? "anon");
  const [valor, setValor] = useState(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) setValor(raw === "1");
    } catch { /* ignore */ }
    const ouvir = (e: Event) => setValor((e as CustomEvent<boolean>).detail);
    window.addEventListener(EVENTO, ouvir);
    return () => window.removeEventListener(EVENTO, ouvir);
  }, [key]);

  const definir = useCallback((v: boolean) => {
    setValor(v);
    try { window.localStorage.setItem(key, v ? "1" : "0"); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent(EVENTO, { detail: v }));
  }, [key]);

  return [valor, definir];
}
