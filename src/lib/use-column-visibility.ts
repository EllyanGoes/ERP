"use client";
/**
 * useColumnVisibility
 *
 * Persiste a visibilidade das colunas de uma tabela no localStorage por usuário.
 * Chave: `erp:colvis:{userId}:{pageKey}`
 *
 * Retorna [visibility, toggleVisibility, showAll]
 *   - visibility: Record<colId, boolean> — false = oculta, ausente = visível
 *   - setVisibility: (id, visible) => void
 *   - showAll: () => void — restaura todas como visíveis
 */

import { useState, useEffect, useCallback } from "react";
import { useSession } from "@/lib/session-context";

function storageKey(userId: string, pageKey: string): string {
  return `erp:colvis:${userId}:${pageKey}`;
}

export function useColumnVisibility(
  pageKey: string,
  allIds: string[],
): [
  Record<string, boolean>,
  (id: string, visible: boolean) => void,
  () => void,
] {
  const { user } = useSession();
  const userId = user?.id ?? "anon";

  const load = (uid: string): Record<string, boolean> => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem(storageKey(uid, pageKey));
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  };

  const [visibility, setVisibilityRaw] = useState<Record<string, boolean>>(
    () => load(userId)
  );

  // Reload when user changes
  useEffect(() => {
    setVisibilityRaw(load(userId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const save = (next: Record<string, boolean>) => {
    try {
      localStorage.setItem(storageKey(userId, pageKey), JSON.stringify(next));
    } catch { /* quota exceeded */ }
  };

  const setVisibility = useCallback(
    (id: string, visible: boolean) => {
      setVisibilityRaw((prev) => {
        // Only store explicitly hidden cols (absence = visible) to keep storage lean
        const next = { ...prev };
        if (visible) delete next[id]; else next[id] = false;
        save(next);
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, pageKey]
  );

  const showAll = useCallback(() => {
    setVisibilityRaw({});
    save({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, pageKey]);

  // Returns true if the column is visible (absent from map OR explicitly true)
  const resolved: Record<string, boolean> = {};
  for (const id of allIds) resolved[id] = visibility[id] !== false;

  return [resolved, setVisibility, showAll];
}
