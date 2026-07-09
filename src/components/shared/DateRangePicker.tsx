"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Calendar, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ── helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatBR(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** "DD/MM/AAAA" → "YYYY-MM-DD" (empty string if invalid) */
function parseBR(s: string): string {
  const match = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "";
  const [, d, m, y] = match;
  const date = new Date(`${y}-${m}-${d}T12:00:00`);
  if (isNaN(date.getTime())) return "";
  return `${y}-${m}-${d}`;
}

/** Auto-insert slashes as the user types digits */
function autoFmt(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function todayISO(): string {
  return toISO(new Date());
}

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const startDow = first.getDay();

  const cells: { iso: string; current: boolean }[] = [];
  for (let i = startDow - 1; i >= 0; i--) {
    cells.push({ iso: toISO(new Date(year, month, -i)), current: false });
  }
  for (let d = 1; d <= last.getDate(); d++) {
    cells.push({ iso: toISO(new Date(year, month, d)), current: true });
  }
  let next = 1;
  while (cells.length < 42) {
    cells.push({ iso: toISO(new Date(year, month + 1, next++)), current: false });
  }
  return cells;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DateRange {
  from: string;
  to:   string;
}

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
  placeholder?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DateRangePicker({ value, onChange, placeholder = "Selecionar período..." }: Props) {
  const today = todayISO();

  const [picking,   setPicking]   = useState<"from" | "to">("from");
  const [hover,     setHover]     = useState("");
  const [viewYear,  setViewYear]  = useState(() => parseInt((value.from || today).split("-")[0]));
  const [viewMonth, setViewMonth] = useState(() => parseInt((value.from || today).split("-")[1]) - 1);
  const [open,      setOpen]      = useState(false);

  // Local typed text for each input (allows partial typing)
  const [fromText, setFromText] = useState(value.from ? formatBR(value.from) : "");
  const [toText,   setToText]   = useState(value.to   ? formatBR(value.to)   : "");

  const wrapRef    = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const fromRef    = useRef<HTMLInputElement>(null);
  const toRef      = useRef<HTMLInputElement>(null);

  // Fixed-position coordinates for the portal popover
  const [popStyle, setPopStyle] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  // Keep text in sync when value changes from outside (e.g. calendar click, clear)
  useEffect(() => {
    setFromText(value.from ? formatBR(value.from) : "");
  }, [value.from]);

  useEffect(() => {
    setToText(value.to ? formatBR(value.to) : "");
  }, [value.to]);

  // Close on outside click — check both trigger and the portal popover
  useEffect(() => {
    function handle(e: MouseEvent) {
      const target = e.target as Node;
      const inTrigger = wrapRef.current?.contains(target);
      const inPopover = popoverRef.current?.contains(target);
      if (!inTrigger && !inPopover) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Close on scroll so the popover doesn't drift away from the trigger
  useEffect(() => {
    if (!open) return;
    function onScroll() { setOpen(false); }
    window.addEventListener("scroll", onScroll, true); // capture catches nested scrollers
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [open]);

  // When opened: sync calendar view + compute fixed position for the portal
  useEffect(() => {
    if (!open) return;
    const src = value.from || today;
    setViewYear(parseInt(src.split("-")[0]));
    setViewMonth(parseInt(src.split("-")[1]) - 1);
    setHover("");
    // Calculate where to place the popover (anchored to trigger's bottom-right)
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPopStyle({
        top:   rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate calendar when picking mode switches to "to"
  // → go to the "to" date month if set, otherwise advance one month from "from"
  useEffect(() => {
    if (!open || picking !== "to") return;
    const src = value.to || value.from || today;
    setViewYear(parseInt(src.split("-")[0]));
    setViewMonth(parseInt(src.split("-")[1]) - 1);
  }, [picking]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── navigation ──────────────────────────────────────────────────────────────
  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }

  // ── calendar day click ───────────────────────────────────────────────────────
  function handleDay(iso: string) {
    if (picking === "from") {
      onChange({ from: iso, to: "" });
      setPicking("to");
      // focus the "to" input
      setTimeout(() => toRef.current?.focus(), 0);
    } else {
      const [f, t] = iso < value.from ? [iso, value.from] : [value.from, iso];
      onChange({ from: f, to: t });
      setPicking("from");
      setOpen(false);
    }
  }

  // ── typed input handlers ─────────────────────────────────────────────────────
  const handleFromChange = useCallback((raw: string) => {
    const formatted = autoFmt(raw);
    setFromText(formatted);
    if (formatted.length === 10) {
      const iso = parseBR(formatted);
      if (iso) {
        onChange({ from: iso, to: value.to });
        // Navigate calendar to the typed "from" month
        setViewYear(parseInt(iso.split("-")[0]));
        setViewMonth(parseInt(iso.split("-")[1]) - 1);
        setPicking("to");
        setTimeout(() => toRef.current?.focus(), 0);
      }
    }
  }, [onChange, value.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToChange = useCallback((raw: string) => {
    const formatted = autoFmt(raw);
    setToText(formatted);
    if (formatted.length === 10) {
      const iso = parseBR(formatted);
      if (iso && value.from) {
        const [f, t] = iso < value.from ? [iso, value.from] : [value.from, iso];
        onChange({ from: f, to: t });
        setOpen(false);
      }
    }
  }, [onChange, value.from]);

  // ── day classification ───────────────────────────────────────────────────────
  const effectiveTo = picking === "to" && hover ? hover : value.to;

  function dayState(iso: string): "start" | "end" | "range" | "none" {
    const { from } = value;
    if (!from) return "none";
    const lo = from <= effectiveTo ? from : effectiveTo;
    const hi = from <= effectiveTo ? effectiveTo : from;
    if (iso === from && iso === effectiveTo) return "start";
    if (iso === lo) return "start";
    if (iso === hi) return "end";
    if (iso > lo && iso < hi) return "range";
    return "none";
  }

  // ── clear ────────────────────────────────────────────────────────────────────
  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange({ from: "", to: "" });
    setPicking("from");
    setFromText("");
    setToText("");
  }

  // ── trigger label ────────────────────────────────────────────────────────────
  const hasValue = value.from || value.to;
  const triggerLabel = value.from && value.to
    ? `${formatBR(value.from)} → ${formatBR(value.to)}`
    : value.from
    ? `${formatBR(value.from)} → ...`
    : placeholder;

  const cells = buildGrid(viewYear, viewMonth);

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <div ref={wrapRef} className="relative">
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { setOpen((v) => !v); setPicking("from"); }}
        className={cn(
          "flex items-center gap-2 h-9 px-3 rounded-lg border text-sm transition-colors select-none",
          open
            ? "border-blue-500 ring-2 ring-blue-100 bg-card"
            : "border-border bg-card hover:border-border",
          hasValue ? "text-foreground" : "text-muted-foreground"
        )}
      >
        <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="whitespace-nowrap">{triggerLabel}</span>
        {hasValue && (
          <span role="button" onClick={clear} className="text-muted-foreground/60 hover:text-muted-foreground ml-0.5 cursor-pointer">
            <X className="w-3 h-3" />
          </span>
        )}
      </button>

      {/* Popover — rendered in a portal with fixed position to avoid parent overflow clipping */}
      {open && typeof window !== "undefined" && createPortal(
        <div
          ref={popoverRef}
          style={{ position: "fixed", top: popStyle.top, right: popStyle.right, zIndex: 9999 }}
          className="bg-card rounded-2xl border border-border shadow-xl p-4 w-[308px]"
        >

          {/* ── Editable date inputs ─────────────────────────────────────── */}
          <div className="flex items-center gap-1.5 mb-4">
            <input
              ref={fromRef}
              type="text"
              inputMode="numeric"
              value={fromText}
              placeholder="DD/MM/AAAA"
              maxLength={10}
              onFocus={() => setPicking("from")}
              onChange={(e) => handleFromChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Tab") { e.preventDefault(); toRef.current?.focus(); } }}
              className={cn(
                "min-w-0 w-0 flex-1 text-xs px-2 py-1.5 rounded-lg border text-center outline-none transition-colors",
                picking === "from"
                  ? "border-blue-500 ring-1 ring-blue-100 bg-card text-foreground"
                  : "border-border bg-muted text-muted-foreground"
              )}
            />

            <span className="text-muted-foreground/60 text-xs shrink-0">→</span>

            <input
              ref={toRef}
              type="text"
              inputMode="numeric"
              value={toText}
              placeholder="DD/MM/AAAA"
              maxLength={10}
              onFocus={() => setPicking("to")}
              onChange={(e) => handleToChange(e.target.value)}
              className={cn(
                "min-w-0 w-0 flex-1 text-xs px-2 py-1.5 rounded-lg border text-center outline-none transition-colors",
                picking === "to"
                  ? "border-blue-500 ring-1 ring-blue-100 bg-card text-foreground"
                  : "border-border bg-muted text-muted-foreground"
              )}
            />
          </div>

          {/* Month header */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-foreground">
              {capitalize(MESES[viewMonth])} de {viewYear}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => { onChange({ from: today, to: today }); setOpen(false); }}
                className="text-xs text-info hover:text-info font-medium px-2 py-0.5 rounded-md hover:bg-info/10 transition-colors"
              >
                Hoje
              </button>
              {/* Atalho: mês atual completo (1º ao último dia). */}
              <button
                type="button"
                onClick={() => {
                  const ini = `${today.slice(0, 8)}01`;
                  const d = new Date(parseInt(today.slice(0, 4)), parseInt(today.slice(5, 7)), 0);
                  const fim = `${today.slice(0, 7)}-${String(d.getDate()).padStart(2, "0")}`;
                  onChange({ from: ini, to: fim });
                  setOpen(false);
                }}
                className="text-xs text-info hover:text-info font-medium px-2 py-0.5 rounded-md hover:bg-info/10 transition-colors"
              >
                Mês
              </button>
              <button type="button" onClick={prevMonth} className="p-1 rounded-md hover:bg-muted transition-colors">
                <ChevronLeft className="w-4 h-4 text-muted-foreground" />
              </button>
              <button type="button" onClick={nextMonth} className="p-1 rounded-md hover:bg-muted transition-colors">
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-1">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground pb-1">{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7">
            {cells.map(({ iso, current }) => {
              const state   = dayState(iso);
              const isToday = iso === today;
              return (
                <button
                  key={iso}
                  type="button"
                  onMouseEnter={() => picking === "to" && setHover(iso)}
                  onMouseLeave={() => setHover("")}
                  onClick={() => handleDay(iso)}
                  className={cn(
                    "relative h-8 text-[13px] text-center transition-colors select-none",
                    !current && "text-muted-foreground/60",
                    current && state === "none" && "hover:bg-info/10 hover:text-info rounded-lg",
                    state === "range" && "bg-info/10 text-info",
                    state === "start" && "text-white",
                    state === "end"   && "text-white",
                    isToday && state === "none" && "font-bold text-info",
                  )}
                >
                  {state === "range" && <span className="absolute inset-y-0 inset-x-0 bg-info/10" />}
                  {state === "start" && value.to && value.to !== value.from && (
                    <span className="absolute inset-y-0 right-0 w-1/2 bg-info/10" />
                  )}
                  {state === "end" && value.from && value.to !== value.from && (
                    <span className="absolute inset-y-0 left-0 w-1/2 bg-info/10" />
                  )}
                  {(state === "start" || state === "end") && (
                    <span className={cn(
                      "absolute inset-1 rounded-full",
                      state === "start" ? "bg-blue-600" : "bg-blue-400"
                    )} />
                  )}
                  <span className="relative z-10">{new Date(iso + "T12:00:00").getDate()}</span>
                </button>
              );
            })}
          </div>

          {/* Footer hint */}
          <p className="text-[10px] text-muted-foreground text-center mt-3">
            {picking === "from"
              ? "Clique no calendário ou digite a data inicial"
              : "Clique no calendário ou digite a data final"}
          </p>
        </div>,
        document.body
      )}
    </div>
  );
}
