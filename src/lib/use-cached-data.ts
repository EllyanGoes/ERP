"use client";

import { useEffect, useRef, useState } from "react";

// Cache em memória, no nível do módulo — sobrevive à navegação entre rotas/abas
// (o módulo não é recarregado). Padrão stale-while-revalidate: ao reabrir uma
// conta/relatório já visto, mostra o dado em cache NA HORA (sem recarregar) e
// revalida em segundo plano, atualizando quando a resposta nova chega.
const cache = new Map<string, unknown>();
// Momento (ms) em que cada chave foi gravada — usado pelo TTL opcional para
// evitar revalidar de novo a cada reabertura de aba (ver `ttlMs`).
const cacheTime = new Map<string, number>();

export function useCachedData<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  opts?: { ttlMs?: number },
): { data: T | null; loading: boolean; refetch: () => void } {
  const [data, setData] = useState<T | null>(() => (key ? ((cache.get(key) as T) ?? null) : null));
  const [loading, setLoading] = useState<boolean>(() => (key ? !cache.has(key) : false));
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const [tick, setTick] = useState(0); // refetch forçado

  useEffect(() => {
    if (!key) { setData(null); setLoading(false); return; }
    const cached = cache.has(key) ? (cache.get(key) as T) : undefined;
    if (cached !== undefined) { setData(cached); setLoading(false); }   // mostra o cache na hora
    else { setData(null); setLoading(true); }
    // TTL opcional: se o cache ainda é "fresco", não revalida — evita o piscar/
    // recarregar dos dados a cada vez que se sai e volta para a aba. Sem ttlMs,
    // o comportamento segue sendo revalidar sempre (compat com os outros usos).
    const fresco =
      cached !== undefined && opts?.ttlMs != null &&
      Date.now() - (cacheTime.get(key) ?? 0) < opts.ttlMs;
    if (fresco) return;
    let cancelado = false;
    fetcherRef.current()
      .then((res) => { if (cancelado) return; cache.set(key, res); cacheTime.set(key, Date.now()); setData(res); setLoading(false); })
      .catch(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [key, tick]);

  return { data, loading, refetch: () => setTick((t) => t + 1) };
}

// Limpa o cache (todo ou por prefixo) — use após gravações que mudam os dados.
export function invalidarCache(prefixo?: string) {
  if (!prefixo) { cache.clear(); return; }
  for (const k of Array.from(cache.keys())) if (k.startsWith(prefixo)) cache.delete(k);
}
