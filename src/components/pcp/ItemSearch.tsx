"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

export interface ItemLite {
  id: string;
  codigo: string;
  descricao: string;
}

export default function ItemSearch({
  onSelect,
  placeholder,
}: {
  onSelect: (it: ItemLite) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ItemLite[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/itens?q=${encodeURIComponent(q)}&limit=15`);
        const j = await r.json();
        setResults(
          (j.data ?? []).map((it: { id: string; codigo: string; descricao: string }) => ({
            id: it.id,
            codigo: it.codigo,
            descricao: it.descricao,
          })),
        );
        setOpen(true);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 focus-within:ring-1 focus-within:ring-cyan-500 bg-white">
        <Search className="w-3.5 h-3.5 text-gray-300 shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder={placeholder ?? "Buscar item (código ou descrição)…"}
          className="flex-1 text-sm outline-none bg-transparent min-w-0"
        />
        {q && (
          <button type="button" onClick={() => { setQ(""); setResults([]); }} className="shrink-0">
            <X className="w-3.5 h-3.5 text-gray-300 hover:text-gray-500" />
          </button>
        )}
      </div>
      {open && (loading || results.length > 0 || q.trim().length >= 2) && (
        <div className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {loading && <div className="px-3 py-2 text-xs text-gray-400">Buscando…</div>}
          {results.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => { onSelect(it); setQ(""); setResults([]); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-cyan-50 text-sm"
            >
              <span className="font-mono text-gray-400 text-xs mr-2">{it.codigo}</span>
              {it.descricao}
            </button>
          ))}
          {!loading && results.length === 0 && q.trim().length >= 2 && (
            <div className="px-3 py-2 text-xs text-gray-400">Nada encontrado</div>
          )}
        </div>
      )}
    </div>
  );
}
