"use client";

import { useEffect, useRef, useState } from "react";

// Cache em memória, no nível do módulo — sobrevive à navegação entre rotas/abas
// (o módulo não é recarregado). Padrão stale-while-revalidate: ao reabrir uma
// conta/relatório já visto, mostra o dado em cache NA HORA (sem recarregar) e
// revalida em segundo plano, atualizando quando a resposta nova chega.
const cache = new Map<string, unknown>();

export function useCachedData<T>(
  key: string | null,
  fetcher: () => Promise<T>,
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
    let cancelado = false;
    fetcherRef.current()
      .then((res) => { if (cancelado) return; cache.set(key, res); setData(res); setLoading(false); })
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
