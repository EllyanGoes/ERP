"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Calendar, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ── helpers ───────────────────────────────────────────────────────────────────
// Trabalha SEMPRE com string ISO "YYYY-MM-DD" (mesmo contrato do <input type="date">),
// sem nunca converter o valor para Date na exibição — evita desvio de fuso.

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatBR(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

/** "DD/MM/AAAA" → "YYYY-MM-DD" (string vazia se inválido) */
function parseBR(s: string): string {
  const match = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "";
  const [, d, m, y] = match;
  const date = new Date(`${y}-${m}-${d}T12:00:00`);
  if (isNaN(date.getTime())) return "";
  // valida que o dia realmente existe (ex.: 31/02 não vira 03/03)
  if (date.getUTCDate() !== parseInt(d)) return "";
  return `${y}-${m}-${d}`;
}

/** Insere as barras automaticamente enquanto o usuário digita */
function autoFmt(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function todayISO(): string {
  return toISO(new Date());
}

const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

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

interface Props {
  /** Data em ISO "YYYY-MM-DD" (ou "" quando vazio) — mesmo contrato do input nativo. */
  value: string;
  /** Recebe a nova data em ISO "YYYY-MM-DD" (ou "" ao limpar). */
  onChange: (iso: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Aplicado ao wrapper — use p/ controlar largura (ex.: "w-full"). */
  className?: string;
  /** Classes extras no gatilho (ex.: "h-8" para linhas de tabela). */
  triggerClassName?: string;
  /** Exibe o "x" para limpar (padrão: true). */
  allowClear?: boolean;
  /** Realça o gatilho com borda de erro (validação). */
  invalid?: boolean;
  /** Limites (ISO) — dias fora do intervalo ficam desabilitados. */
  min?: string;
  max?: string;
  id?: string;
  name?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DatePicker({
  value,
  onChange,
  placeholder = "DD/MM/AAAA",
  disabled,
  className,
  triggerClassName,
  allowClear = true,
  invalid = false,
  min,
  max,
  id,
  name,
}: Props) {
  const today = todayISO();

  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value ? formatBR(value) : "");
  const [viewYear,  setViewYear]  = useState(() => parseInt((value || today).split("-")[0]));
  const [viewMonth, setViewMonth] = useState(() => parseInt((value || today).split("-")[1]) - 1);

  const wrapRef    = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  const [popStyle, setPopStyle] = useState<{ top?: number; bottom?: number; left: number }>({ left: 0 });

  useEffect(() => { setMounted(true); }, []);

  // Sincroniza o texto quando o valor muda de fora (calendário, reset, etc.)
  useEffect(() => { setText(value ? formatBR(value) : ""); }, [value]);

  // Fecha ao clicar fora (gatilho + popover)
  useEffect(() => {
    function handle(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function calcPosition() {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const POP_H = 340;
    const POP_W = 288;
    const MARGIN = 8;
    const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
    const spaceAbove = rect.top - MARGIN;
    const openUpward = spaceBelow < POP_H && spaceAbove > spaceBelow;
    const left = Math.min(rect.left, Math.max(MARGIN, window.innerWidth - POP_W - MARGIN));
    setPopStyle(openUpward
      ? { bottom: window.innerHeight - rect.top + 6, left }
      : { top: rect.bottom + 6, left });
  }

  // Ao abrir: posiciona o popover e leva o calendário ao mês do valor
  useEffect(() => {
    if (!open) return;
    const src = value || today;
    setViewYear(parseInt(src.split("-")[0]));
    setViewMonth(parseInt(src.split("-")[1]) - 1);
    calcPosition();
    window.addEventListener("scroll", calcPosition, true);
    window.addEventListener("resize", calcPosition);
    return () => {
      window.removeEventListener("scroll", calcPosition, true);
      window.removeEventListener("resize", calcPosition);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }

  function isBlocked(iso: string) {
    if (min && iso < min) return true;
    if (max && iso > max) return true;
    return false;
  }

  function pick(iso: string) {
    if (isBlocked(iso)) return;
    onChange(iso);
    setText(formatBR(iso));
    setOpen(false);
  }

  function handleType(raw: string) {
    setOpen(true); // digitar abre o calendário (foco sozinho não abre)
    const formatted = autoFmt(raw);
    setText(formatted);
    if (formatted === "") { onChange(""); return; }
    if (formatted.length === 10) {
      const iso = parseBR(formatted);
      if (iso && !isBlocked(iso)) {
        onChange(iso);
        setViewYear(parseInt(iso.split("-")[0]));
        setViewMonth(parseInt(iso.split("-")[1]) - 1);
      }
    }
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
    setText("");
    setOpen(false);
  }

  const cells = buildGrid(viewYear, viewMonth);

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      {/* Gatilho — ícone + input mascarado (dd/mm/aaaa) */}
      <div
        ref={triggerRef}
        onClick={() => { if (!disabled) { setOpen(true); inputRef.current?.focus(); } }}
        className={cn(
          "flex items-center gap-2 h-9 w-full px-3 rounded-lg border bg-card text-sm transition-colors cursor-text",
          open ? "border-blue-500 ring-2 ring-blue-100" : "border-input hover:border-border",
          invalid && !open && "border-danger",
          disabled && "opacity-50 cursor-not-allowed",
          triggerClassName,
        )}
      >
        <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          disabled={disabled}
          value={text}
          placeholder={placeholder}
          maxLength={10}
          // Abrir só no clique/digitação — abrir no focus fazia o calendário
          // aparecer sozinho quando um dialog autofocava o campo.
          onChange={(e) => handleType(e.target.value)}
          className="min-w-0 w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
        {allowClear && value && !disabled && (
          <span
            role="button"
            onClick={clear}
            className="text-muted-foreground/60 hover:text-muted-foreground shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
      </div>

      {/* Popover (portal, posição fixa) */}
      {mounted && open && createPortal(
        <div
          ref={popoverRef}
          style={{ position: "fixed", top: popStyle.top, bottom: popStyle.bottom, left: popStyle.left, zIndex: 9999 }}
          className="bg-card rounded-2xl border border-border shadow-xl p-4 w-[288px]"
        >
          {/* Cabeçalho do mês */}
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={prevMonth} className="p-1 rounded-md hover:bg-muted transition-colors">
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            </button>
            <span className="text-sm font-semibold text-foreground select-none">
              {capitalize(MESES[viewMonth])} {viewYear}
            </span>
            <button type="button" onClick={nextMonth} className="p-1 rounded-md hover:bg-muted transition-colors">
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Cabeçalho dos dias da semana */}
          <div className="grid grid-cols-7 mb-1">
            {DIAS_SEMANA.map((d, i) => (
              <div key={i} className="text-center text-[11px] font-medium text-muted-foreground pb-1">{d}</div>
            ))}
          </div>

          {/* Grade de dias */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map(({ iso, current }) => {
              const isSelected = iso === value;
              const isToday    = iso === today;
              const blocked    = isBlocked(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={blocked}
                  onClick={() => pick(iso)}
                  className={cn(
                    "relative h-9 text-[13px] text-center select-none flex items-center justify-center transition-colors",
                    !current && "text-muted-foreground/50",
                    blocked && "opacity-30 cursor-not-allowed",
                    !blocked && !isSelected && "hover:bg-muted rounded-full",
                    isToday && !isSelected && "font-semibold text-info",
                  )}
                >
                  {isSelected && <span className="absolute inset-1 rounded-full bg-foreground" />}
                  <span className={cn("relative z-10", isSelected && "text-background font-medium")}>
                    {new Date(iso + "T12:00:00").getDate()}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Rodapé: atalho "Hoje" */}
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => pick(today)}
              className="text-xs text-info hover:text-info font-medium px-2 py-1 rounded-md hover:bg-info/10 transition-colors"
            >
              Hoje
            </button>
            {allowClear && value && (
              <button
                type="button"
                onClick={() => { onChange(""); setText(""); setOpen(false); }}
                className="text-xs text-muted-foreground hover:text-foreground font-medium px-2 py-1 rounded-md hover:bg-muted transition-colors"
              >
                Limpar
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
