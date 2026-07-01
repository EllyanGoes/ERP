"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Redimensionamento de colunas em TODAS as tabelas do sistema, sem tocar em cada
// tela. Um provider montado no layout observa o <main> e, ao passar o mouse no
// cabeçalho de qualquer <table>, mostra alças nas divisas das colunas:
//   • arrastar  → ajusta a largura manualmente;
//   • duplo-clique → ajusta a coluna ao conteúdo (auto-fit).
// As larguras são persistidas por usuário + tabela (localStorage) e reaplicadas
// ao reabrir a tela. Baixo risco: a tabela só é "congelada" (table-layout fixed)
// depois da 1ª interação OU se já houver largura salva — antes disso fica igual.
// Não injeta DOM dentro da tabela (as alças vivem num portal), evitando conflito
// com o React.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/session-context";

const MIN_W = 48;

type Handle = { x: number; top: number; height: number; index: number };

function headerCells(table: HTMLTableElement): HTMLTableCellElement[] {
  const head = table.tHead;
  let row: HTMLTableRowElement | null = null;
  if (head && head.rows.length) row = head.rows[head.rows.length - 1];
  else if (table.rows.length) row = table.rows[0];
  if (!row) return [];
  // Ignora tabelas com célula de span (cabeçalho agrupado) — não dá p/ mapear 1:1.
  const cells = Array.from(row.cells) as HTMLTableCellElement[];
  if (cells.some((c) => c.colSpan > 1)) return [];
  return cells;
}

function sig(table: HTMLTableElement): string {
  return headerCells(table).map((c) => (c.textContent || "").trim().slice(0, 16)).join("~");
}

function applyWidths(table: HTMLTableElement, widths: number[]): boolean {
  const ths = headerCells(table);
  if (!ths.length || ths.length !== widths.length) return false;
  table.style.tableLayout = "fixed";
  table.style.width = widths.reduce((a, b) => a + b, 0) + "px";
  ths.forEach((th, i) => { th.style.width = widths[i] + "px"; });
  return true;
}

function measure(table: HTMLTableElement): number[] {
  return headerCells(table).map((th) => Math.round(th.getBoundingClientRect().width));
}

export default function ColumnResizer() {
  const pathname = usePathname();
  const { user } = useSession();
  const uid = user?.id ?? "anon";

  const [mounted, setMounted] = useState(false);
  const [handles, setHandles] = useState<Handle[]>([]);
  const activeRef = useRef<HTMLTableElement | null>(null);
  const dragRef = useRef<null | { table: HTMLTableElement; index: number; startX: number; widths: number[] }>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Ao trocar de tela, some com alças de uma tabela que não existe mais.
  useEffect(() => { activeRef.current = null; setHandles([]); }, [pathname]);

  const lsKey = useCallback((table: HTMLTableElement) => `erp:colw:${uid}:${pathname}#${sig(table)}`, [uid, pathname]);

  const load = useCallback((table: HTMLTableElement): number[] | null => {
    try { const r = localStorage.getItem(lsKey(table)); return r ? (JSON.parse(r) as number[]) : null; } catch { return null; }
  }, [lsKey]);
  const save = useCallback((table: HTMLTableElement, w: number[]) => {
    try { localStorage.setItem(lsKey(table), JSON.stringify(w)); } catch { /* storage cheio */ }
  }, [lsKey]);

  // ── Reaplica larguras salvas às tabelas da tela (e quando o React re-renderiza)
  const applyStored = useCallback(() => {
    const root = document.getElementById("erp-main") || document.body;
    root.querySelectorAll("table").forEach((t) => {
      const table = t as HTMLTableElement;
      const ths = headerCells(table);
      if (ths.length < 2) return;
      const stored = load(table);
      if (!stored || stored.length !== ths.length) return;
      // Reaplica se o React limpou o estilo (nós não observamos 'attributes',
      // então nossos writes não disparam o observer → sem loop).
      if (table.style.tableLayout !== "fixed" || !ths[0].style.width) applyWidths(table, stored);
    });
  }, [load]);

  useEffect(() => {
    if (!mounted) return;
    applyStored();
    const root = document.getElementById("erp-main") || document.body;
    const obs = new MutationObserver(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(applyStored);
    });
    obs.observe(root, { childList: true, subtree: true });
    return () => { obs.disconnect(); if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [mounted, applyStored]);

  // ── Alças de redimensionamento (posições calculadas do DOM, sem injetar nada)
  const computeHandles = useCallback(() => {
    if (dragRef.current) return;
    const table = activeRef.current;
    if (!table || !document.body.contains(table)) { activeRef.current = null; setHandles([]); return; }
    const ths = headerCells(table);
    if (ths.length < 2) { setHandles([]); return; }
    setHandles(ths.map((th, i) => {
      const r = th.getBoundingClientRect();
      return { x: r.right, top: r.top, height: r.height, index: i };
    }));
  }, []);

  const scheduleCompute = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(computeHandles);
  }, [computeHandles]);

  useEffect(() => {
    if (!mounted) return;
    function onOver(e: MouseEvent) {
      if (dragRef.current) return;
      const el = e.target as HTMLElement;
      const table = el.closest?.("#erp-main table") as HTMLTableElement | null;
      if (table && table !== activeRef.current && headerCells(table).length >= 2) {
        activeRef.current = table;
        computeHandles();
      }
    }
    document.addEventListener("mouseover", onOver, true);
    window.addEventListener("scroll", scheduleCompute, true);
    window.addEventListener("resize", scheduleCompute);
    return () => {
      document.removeEventListener("mouseover", onOver, true);
      window.removeEventListener("scroll", scheduleCompute, true);
      window.removeEventListener("resize", scheduleCompute);
    };
  }, [mounted, computeHandles, scheduleCompute]);

  // ── Arrastar
  const onDragMove = useCallback((e: MouseEvent) => {
    const d = dragRef.current; if (!d) return;
    const delta = e.clientX - d.startX;
    const widths = [...d.widths];
    widths[d.index] = Math.max(MIN_W, d.widths[d.index] + delta);
    applyWidths(d.table, widths);
  }, []);

  const onDragUp = useCallback(() => {
    const d = dragRef.current; if (!d) return;
    save(d.table, measure(d.table));
    dragRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragUp);
    computeHandles();
  }, [save, onDragMove, computeHandles]);

  const startDrag = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault(); e.stopPropagation();
    const table = activeRef.current; if (!table) return;
    const widths = measure(table);
    applyWidths(table, widths); // congela (fixed) na 1ª interação
    dragRef.current = { table, index, startX: e.clientX, widths };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    setHandles([]);
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragUp);
  }, [onDragMove, onDragUp]);

  // ── Duplo-clique: ajusta a coluna ao conteúdo
  const autofit = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault(); e.stopPropagation();
    const table = activeRef.current; if (!table) return;
    const ths = headerCells(table);
    const widths = measure(table);
    // Mede a largura natural da coluna: layout auto, demais colunas travadas.
    table.style.tableLayout = "auto";
    ths.forEach((th, i) => { th.style.width = i === index ? "" : widths[i] + "px"; });
    const natural = Math.ceil(ths[index].getBoundingClientRect().width) + 2;
    widths[index] = Math.max(MIN_W, natural);
    applyWidths(table, widths);
    save(table, widths);
    computeHandles();
  }, [save, computeHandles]);

  if (!mounted || !handles.length) return null;

  return createPortal(
    <>
      {handles.map((h) => (
        <div
          key={h.index}
          onMouseDown={(e) => startDrag(e, h.index)}
          onDoubleClick={(e) => autofit(e, h.index)}
          title="Arraste para redimensionar · duplo-clique ajusta ao conteúdo"
          style={{ position: "fixed", left: h.x - 3, top: h.top, width: 7, height: h.height, cursor: "col-resize", zIndex: 40, pointerEvents: "auto" }}
          className="group"
        >
          <div className="mx-auto h-full w-px bg-transparent transition-colors group-hover:bg-blue-500/70" />
        </div>
      ))}
    </>,
    document.body,
  );
}
