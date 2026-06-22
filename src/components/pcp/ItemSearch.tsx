"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";

export interface ItemLite {
  id: string;
  codigo: string;
  descricao: string;
}

export default function ItemSearch({
  onSelect,
  placeholder,
  categoria,
}: {
  onSelect: (it: ItemLite) => void;
  placeholder?: string;
  categoria?: string | null;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ItemLite[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/itens?q=${encodeURIComponent(q)}&limit=15${categoria ? `&categoria=${encodeURIComponent(categoria)}` : ""}`);
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
  }, [q, categoria]);

  // Posição do dropdown (portal, fixed) — evita recorte por ancestral com overflow.
  function calcPos() {
    if (!boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    const MAX_H = 224;
    const MARGIN = 8;
    const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
    setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width, maxHeight: Math.min(MAX_H, Math.max(120, spaceBelow)) });
  }

  useEffect(() => {
    if (!open) return;
    calcPos();
    const onScroll = () => calcPos();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, results.length]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      // Não fechar ao clicar no próprio campo nem dentro do dropdown (portal).
      if (boxRef.current?.contains(t) || dropdownRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const showDropdown = open && (loading || results.length > 0 || q.trim().length >= 2);

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 focus-within:ring-1 focus-within:ring-cyan-500 bg-card">
        <Search className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => { if (results.length) { setOpen(true); calcPos(); } }}
          placeholder={placeholder ?? "Buscar item (código ou descrição)…"}
          className="flex-1 text-sm outline-none bg-transparent min-w-0"
        />
        {q && (
          <button type="button" onClick={() => { setQ(""); setResults([]); setOpen(false); }} className="shrink-0">
            <X className="w-3.5 h-3.5 text-muted-foreground/60 hover:text-muted-foreground" />
          </button>
        )}
      </div>
      {mounted && showDropdown && pos && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
          className="z-[9999] overflow-y-auto rounded-lg border border-border bg-card shadow-lg"
        >
          {loading && <div className="px-3 py-2 text-xs text-muted-foreground">Buscando…</div>}
          {results.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => { onSelect(it); setQ(""); setResults([]); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
            >
              <span className="font-mono text-muted-foreground text-xs mr-2">{it.codigo}</span>
              {it.descricao}
            </button>
          ))}
          {!loading && results.length === 0 && q.trim().length >= 2 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">Nada encontrado</div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
