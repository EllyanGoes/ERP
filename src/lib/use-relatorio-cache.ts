"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Cache de relatórios (stale-while-revalidate, sessionStorage).
//
// Relatórios do PCM consultam o Engeman e demoram alguns segundos. Este hook
// devolve NA HORA a última resposta salva para a mesma URL (sem spinner) e
// dispara a busca fresca em segundo plano — quando chega, a tela atualiza e o
// cache é renovado. `recarregar()` força uma nova busca (botão Atualizar).
// O cache vive por aba (sessionStorage) e muda por URL (filtros incluídos).
// ─────────────────────────────────────────────────────────────────────────────

const PREFIXO = "relatorio-cache:";

function ler<T>(url: string): T | null {
  try {
    const bruto = sessionStorage.getItem(PREFIXO + url);
    return bruto ? (JSON.parse(bruto) as T) : null;
  } catch {
    return null;
  }
}

function gravar(url: string, dados: unknown) {
  try {
    sessionStorage.setItem(PREFIXO + url, JSON.stringify(dados));
  } catch {
    // storage cheio — segue sem cache
  }
}

export function useRelatorioCache<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);      // primeira carga SEM cache
  const [refreshing, setRefreshing] = useState(false); // busca em segundo plano
  const [erro, setErro] = useState<string | null>(null);
  const urlAtual = useRef(url);
  urlAtual.current = url;

  const buscar = useCallback(async (comCache: boolean) => {
    const alvo = urlAtual.current;
    const emCache = comCache ? ler<T>(alvo) : null;
    if (emCache) {
      setData(emCache);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setErro(null);
    try {
      const res = await fetch(alvo);
      if (alvo !== urlAtual.current) return; // filtros mudaram no meio — descarta
      if (!res.ok) {
        // mantém o cache na tela se houver; só acusa erro sem nada para mostrar
        if (!emCache) { setErro("Não foi possível carregar o relatório."); setData(null); }
        return;
      }
      const json = (await res.json()) as T;
      if (alvo !== urlAtual.current) return;
      setData(json);
      gravar(alvo, json);
    } catch {
      if (alvo === urlAtual.current && !emCache) { setErro("Erro de conexão."); setData(null); }
    } finally {
      if (alvo === urlAtual.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => { buscar(true); }, [url, buscar]);

  const recarregar = useCallback(() => buscar(false), [buscar]);

  return { data, loading, refreshing, erro, recarregar };
}
