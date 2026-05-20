"use client";
/**
 * useColumnOrder
 *
 * Persiste a ordem das colunas de uma tabela no localStorage com chave por usuário.
 * Chave: `erp:colorder:{userId}:{pageKey}`
 *
 * - Colunas novas (adicionadas ao código depois de um save) são inseridas no final.
 * - Colunas removidas do código são ignoradas silenciosamente.
 *
 * Uso:
 *   const [order, setOrder] = useColumnOrder("fornecedores", COLS.map(c => c.id));
 */

import { useState, useEffect, useCallback } from "react";
import { useSession } from "@/lib/session-context";

function storageKey(userId: string, pageKey: string): string {
  return `erp:colorder:${userId}:${pageKey}`;
}

function mergeOrder(saved: string[], defaults: string[]): string[] {
  // Keep saved order for known cols; append any new cols at the end
  return [
    ...saved.filter((id) => defaults.includes(id)),
    ...defaults.filter((id) => !saved.includes(id)),
  ];
}

export function useColumnOrder(
  pageKey: string,
  defaultOrder: string[],
): [string[], (newOrder: string[]) => void] {
  const { user } = useSession();
  const userId = user?.id ?? "anon";

  const [order, setOrderRaw] = useState<string[]>(() => {
    if (typeof window === "undefined") return defaultOrder;
    try {
      const raw = localStorage.getItem(storageKey(userId, pageKey));
      if (raw) return mergeOrder(JSON.parse(raw) as string[], defaultOrder);
    } catch {
      // corrupt data — fall through to default
    }
    return defaultOrder;
  });

  // Reload when the logged-in user changes (e.g. logout → login as someone else)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(storageKey(userId, pageKey));
      setOrderRaw(raw ? mergeOrder(JSON.parse(raw) as string[], defaultOrder) : defaultOrder);
    } catch {
      setOrderRaw(defaultOrder);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const setOrder = useCallback(
    (newOrder: string[]) => {
      setOrderRaw(newOrder);
      try {
        localStorage.setItem(storageKey(userId, pageKey), JSON.stringify(newOrder));
      } catch {
        // localStorage full or unavailable — update state anyway
      }
    },
    [userId, pageKey],
  );

  return [order, setOrder];
}
