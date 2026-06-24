"use client";

import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";

function ler<T>(key: string, inicial: T | (() => T)): T {
  const fallback = (): T => (typeof inicial === "function" ? (inicial as () => T)() : inicial);
  if (typeof window === "undefined") return fallback();
  try {
    const raw = window.localStorage.getItem(key);
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
export function usePersistedState<T>(
  key: string,
  inicial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const [valor, setValor] = useState<T>(() => ler(key, inicial));

  // Recarrega se a key mudar em runtime (ex.: filtro por empresa/contexto).
  const keyRef = useRef(key);
  useEffect(() => {
    if (keyRef.current !== key) {
      keyRef.current = key;
      setValor(ler(key, inicial));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify(valor)); } catch { /* ignore */ }
  }, [key, valor]);

  return [valor, setValor];
}
