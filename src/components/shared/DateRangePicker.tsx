"use client";

import { useState, useRef, useEffect } from "react";
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

// Build a 6-week grid (42 cells) for the given year+month
function buildGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const startDow = first.getDay(); // 0=Sun

  const cells: { iso: string; current: boolean }[] = [];

  // leading days from previous month
  for (let i = startDow - 1; i >= 0; i--) {
    cells.push({ iso: toISO(new Date(year, month, -i)), current: false });
  }
  // days of current month
  for (let d = 1; d <= last.getDate(); d++) {
    cells.push({ iso: toISO(new Date(year, month, d)), current: true });
  }
  // trailing days to fill 42 cells
  let next = 1;
  while (cells.length < 42) {
    cells.push({ iso: toISO(new Date(year, month + 1, next++)), current: false });
  }
  return cells;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DateRange {
  from: string; // "YYYY-MM-DD" or ""
  to:   string; // "YYYY-MM-DD" or ""
}

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
  placeholder?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DateRangePicker({ value, onChange, placeholder = "Selecionar período..." }: Props) {
  const today = todayISO();

  // Which side the user is currently picking
  const [picking, setPicking] = useState<"from" | "to">("from");
  // Hover ISO for live range preview
  const [hover, setHover] = useState("");
  // Calendar view
  const [viewYear,  setViewYear]  = useState(() => {
    const src = value.from || today;
    return parseInt(src.split("-")[0]);
  });
  const [viewMonth, setViewMonth] = useState(() => {
    const src = value.from || today;
    return parseInt(src.split("-")[1]) - 1;
  });

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // When opened, sync view to the 'from' date
  useEffect(() => {
    if (!open) return;
    const src = value.from || today;
    setViewYear(parseInt(src.split("-")[0]));
    setViewMonth(parseInt(src.split("-")[1]) - 1);
    setPicking("from");
    setHover("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── navigation ──────────────────────────────────────────────────────────────

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }

  // ── day click ───────────────────────────────────────────────────────────────

  function handleDay(iso: string) {
    if (picking === "from") {
      // Start fresh selection
      onChange({ from: iso, to: "" });
      setPicking("to");
    } else {
      // Complete selection — always keep from ≤ to
      const [f, t] = iso < value.from ? [iso, value.from] : [value.from, iso];
      onChange({ from: f, to: t });
      setPicking("from");
      setOpen(false);
    }
  }

  // ── day classification ───────────────────────────────────────────────────────

  const effectiveTo = picking === "to" && hover ? hover : value.to;

  function dayState(iso: string): "start" | "end" | "range" | "none" {
    const { from } = value;
    if (!from) return "none";
    const lo = from <= effectiveTo ? from : effectiveTo;
    const hi = from <= effectiveTo ? effectiveTo : from;
    if (iso === from && iso === effectiveTo) return "start"; // single day
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
      {/* ── Trigger button ─────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 h-9 px-3 rounded-lg border text-sm transition-colors select-none",
          open
            ? "border-blue-500 ring-2 ring-blue-100 bg-white"
            : "border-gray-200 bg-white hover:border-gray-300",
          hasValue ? "text-gray-800" : "text-gray-400"
        )}
      >
        <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <span className="whitespace-nowrap">{triggerLabel}</span>
        {hasValue && (
          <span
            role="button"
            onClick={clear}
            className="text-gray-300 hover:text-gray-500 ml-0.5 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </span>
        )}
      </button>

      {/* ── Popover ────────────────────────────────────────────────────────── */}
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 bg-white rounded-2xl border border-gray-200 shadow-xl p-4 w-[308px]">

          {/* Date inputs row */}
          <div className="flex items-center gap-2 mb-4">
            <button
              type="button"
              onClick={() => setPicking("from")}
              className={cn(
                "flex-1 text-sm px-3 py-1.5 rounded-lg border text-center transition-colors",
                picking === "from" && open
                  ? "border-blue-500 ring-1 ring-blue-200 bg-white text-gray-800"
                  : "border-gray-200 bg-gray-50 text-gray-700"
              )}
            >
              {value.from ? formatBR(value.from) : <span className="text-gray-400">DD/MM/AAAA</span>}
            </button>

            <span className="text-gray-400 text-xs font-medium">→</span>

            <button
              type="button"
              onClick={() => setPicking("to")}
              className={cn(
                "flex-1 text-sm px-3 py-1.5 rounded-lg border text-center transition-colors",
                picking === "to" && open
                  ? "border-blue-500 ring-1 ring-blue-200 bg-white text-gray-800"
                  : "border-gray-200 bg-gray-50 text-gray-700"
              )}
            >
              {value.to ? formatBR(value.to) : <span className="text-gray-400">DD/MM/AAAA</span>}
            </button>

            {/* ··· preset menu placeholder — keeps visual parity with screenshot */}
            <span className="text-gray-300 text-base font-bold tracking-tight select-none">···</span>
          </div>

          {/* Month header */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-800">
              {capitalize(MESES[viewMonth])} de {viewYear}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => { onChange({ from: today, to: today }); setOpen(false); }}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-0.5 rounded-md hover:bg-blue-50 transition-colors"
              >
                Hoje
              </button>
              <button type="button" onClick={prevMonth} className="p-1 rounded-md hover:bg-gray-100 transition-colors">
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              <button type="button" onClick={nextMonth} className="p-1 rounded-md hover:bg-gray-100 transition-colors">
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-1">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="text-center text-[10px] font-semibold text-gray-400 pb-1">
                {d}
              </div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7">
            {cells.map(({ iso, current }) => {
              const state  = dayState(iso);
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
                    // dimmed days from other months
                    !current && "text-gray-300",
                    // normal hover for unselected current-month days
                    current && state === "none" && "hover:bg-blue-50 hover:text-blue-700 rounded-lg",
                    // range band (no rounding at edges)
                    state === "range" && "bg-blue-50 text-blue-800",
                    // start of range: left half has bg, right half plain
                    state === "start" && "text-white",
                    // end of range: right half has bg, left half plain
                    state === "end" && "text-white",
                    // today dot
                    isToday && state === "none" && "font-bold text-blue-600",
                  )}
                >
                  {/* range bg behind the circle */}
                  {state === "range" && (
                    <span className="absolute inset-y-0 inset-x-0 bg-blue-50" />
                  )}
                  {/* half-bg for start (right side) */}
                  {state === "start" && value.to && value.to !== value.from && (
                    <span className="absolute inset-y-0 right-0 w-1/2 bg-blue-50" />
                  )}
                  {/* half-bg for end (left side) */}
                  {state === "end" && value.from && value.to !== value.from && (
                    <span className="absolute inset-y-0 left-0 w-1/2 bg-blue-50" />
                  )}
                  {/* circle for start/end */}
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
          <p className="text-[10px] text-gray-400 text-center mt-3">
            {picking === "from" ? "Clique para definir a data inicial" : "Clique para definir a data final"}
          </p>
        </div>
      )}
    </div>
  );
}
