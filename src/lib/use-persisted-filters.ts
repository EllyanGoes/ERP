"use client";
/**
 * usePersistedFilters
 *
 * Persiste o estado de filtros de uma página no localStorage com chave por usuário.
 * Chave: `erp:filters:{userId}:{pageKey}`
 *
 * Uso:
 *   const [f, setF] = usePersistedFilters("necessidades", { search: "", status: "todos" });
 *   const { search, status } = f;
 *   setF({ search: "novo" });          // atualiza só search
 *   setF(prev => ({ ...prev, ... }));  // callback form
 */

import { useState, useEffect, useCallback } from "react";
import { useSession } from "@/lib/session-context";

function storageKey(userId: string, pageKey: string): string {
  return `erp:filters:${userId}:${pageKey}`;
}

type Updater<T> = Partial<T> | ((prev: T) => Partial<T>);

export function usePersistedFilters<T extends Record<string, unknown>>(
  pageKey: string,
  defaults: T,
): [T, (updates: Updater<T>) => void] {
  const { user } = useSession();
  const userId = user?.id ?? "anon";

  // Initialise: try to restore from localStorage, merge over defaults so new
  // fields added later fall back to their default values gracefully.
  const [state, setStateRaw] = useState<T>(() => {
    if (typeof window === "undefined") return defaults;
    try {
      const raw = localStorage.getItem(storageKey(userId, pageKey));
      if (raw) return { ...defaults, ...JSON.parse(raw) } as T;
    } catch {
      // ignore corrupt data
    }
    return defaults;
  });

  // When the user changes (e.g. logout → login as different user), reload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(storageKey(userId, pageKey));
      setStateRaw(raw ? ({ ...defaults, ...JSON.parse(raw) } as T) : defaults);
    } catch {
      setStateRaw(defaults);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const setFilters = useCallback(
    (updates: Updater<T>) => {
      setStateRaw((prev) => {
        const partial = typeof updates === "function" ? updates(prev) : updates;
        const next = { ...prev, ...partial };
        try {
          localStorage.setItem(storageKey(userId, pageKey), JSON.stringify(next));
        } catch {
          // localStorage full or unavailable — update state anyway
        }
        return next;
      });
    },
    [userId, pageKey],
  );

  return [state, setFilters];
}
