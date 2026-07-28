"use client";

import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/session-context";

// Mesma convenção de chave do usePersistedFilters (por usuário) — em terminais
// compartilhados cada usuário tem seus próprios filtros.
function chave(userId: string, key: string): string {
  return `erp:filters:${userId}:${key}`;
}

function ler<T>(fullKey: string, inicial: T | (() => T)): T {
  const fallback = (): T => (typeof inicial === "function" ? (inicial as () => T)() : inicial);
  if (typeof window === "undefined") return fallback();
  try {
    const raw = window.localStorage.getItem(fullKey);
    if (raw != null) return JSON.parse(raw) as T;
  } catch { /* ignore */ }
  return fallback();
}

/**
 * `useState` que persiste no localStorage e é lido JÁ no 1º render (lazy
 * initializer) — sem flash do default e sem busca dupla. Padrão do sistema para
 * filtros que devem sobreviver a trocar de aba e voltar.
 *
 *   const [range, setRange] = usePersistedState("contabilidade:balancete:range", defaultRange);
 *
 * `key` deve ser única por tela+campo. O valor é serializado em JSON.
 */
/**
 * Variante por SESSÃO do navegador (sessionStorage): o valor sobrevive à
 * navegação entre telas, mas uma sessão nova volta ao default. Para filtros
 * "voláteis" como busca e mês — que devem persistir ao trocar de página sem
 * prender o usuário num estado antigo dias depois.
 */
export function useSessionState<T>(
  key: string,
  inicial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const { user } = useSession();
  const fullKey = chave(user?.id ?? "anon", key);
  const [valor, setValor] = useState<T>(() => {
    const fallback = (): T => (typeof inicial === "function" ? (inicial as () => T)() : inicial);
    if (typeof window === "undefined") return fallback();
    try {
      const raw = window.sessionStorage.getItem(fullKey);
      if (raw != null) return JSON.parse(raw) as T;
    } catch { /* ignore */ }
    return fallback();
  });
  useEffect(() => {
    try { window.sessionStorage.setItem(fullKey, JSON.stringify(valor)); } catch { /* ignore */ }
  }, [fullKey, valor]);
  return [valor, setValor];
}

export function usePersistedState<T>(
  key: string,
  inicial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const { user } = useSession();
  const fullKey = chave(user?.id ?? "anon", key);

  const [valor, setValor] = useState<T>(() => ler(fullKey, inicial));

  // Recarrega se a chave mudar (ex.: o usuário da sessão hidratou/trocou).
  const keyRef = useRef(fullKey);
  useEffect(() => {
    if (keyRef.current !== fullKey) {
      keyRef.current = fullKey;
      setValor(ler(fullKey, inicial));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey]);

  useEffect(() => {
    try { window.localStorage.setItem(fullKey, JSON.stringify(valor)); } catch { /* ignore */ }
  }, [fullKey, valor]);

  return [valor, setValor];
}
