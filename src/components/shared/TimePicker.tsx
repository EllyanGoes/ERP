"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Campo de hora "HH:MM" no mesmo estilo do DatePicker: input mascarado +
// lista de horários (passo de 30 min) em portal. Trabalha SEMPRE com string
// "HH:MM" ("" = sem hora), nunca com Date — evita desvio de fuso.

function autoFmt(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function valida(s: string): string {
  const m = s.match(/^(\d{2}):(\d{2})$/);
  if (!m) return "";
  const h = parseInt(m[1]), mi = parseInt(m[2]);
  if (h > 23 || mi > 59) return "";
  return s;
}

const SLOTS: string[] = [];
for (let h = 0; h < 24; h++) for (const m of ["00", "30"]) SLOTS.push(`${String(h).padStart(2, "0")}:${m}`);

interface Props {
  /** "HH:MM" ou "" quando vazio. */
  value: string;
  onChange: (hhmm: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  allowClear?: boolean;
  autoFocus?: boolean;
  id?: string;
}

export default function TimePicker({
  value, onChange, placeholder = "HH:MM", disabled, className, triggerClassName, allowClear = true, autoFocus = false, id,
}: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [popStyle, setPopStyle] = useState<{ top?: number; bottom?: number; left: number }>({ left: 0 });

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setText(value); }, [value]);

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
    const POP_H = 240, POP_W = 140, MARGIN = 8;
    const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
    const spaceAbove = rect.top - MARGIN;
    const openUpward = spaceBelow < POP_H && spaceAbove > spaceBelow;
    const left = Math.min(rect.left, Math.max(MARGIN, window.innerWidth - POP_W - MARGIN));
    setPopStyle(openUpward ? { bottom: window.innerHeight - rect.top + 6, left } : { top: rect.bottom + 6, left });
  }

  useEffect(() => {
    if (!open) return;
    calcPosition();
    // Rola a lista até o horário atual (ou 08:00).
    const alvo = value || "08:00";
    const idx = SLOTS.findIndex((s) => s >= alvo);
    requestAnimationFrame(() => {
      const el = listRef.current?.children[Math.max(0, idx)] as HTMLElement | undefined;
      el?.scrollIntoView({ block: "center" });
    });
    window.addEventListener("scroll", calcPosition, true);
    window.addEventListener("resize", calcPosition);
    return () => {
      window.removeEventListener("scroll", calcPosition, true);
      window.removeEventListener("resize", calcPosition);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(hhmm: string) {
    onChange(hhmm);
    setText(hhmm);
    setOpen(false);
  }

  function handleType(raw: string) {
    setOpen(true);
    const f = autoFmt(raw);
    setText(f);
    if (f === "") { onChange(""); return; }
    if (f.length === 5) {
      const v = valida(f);
      if (v) onChange(v);
    }
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
    setText("");
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <div
        ref={triggerRef}
        onClick={() => { if (!disabled) { setOpen(true); inputRef.current?.focus(); } }}
        className={cn(
          "flex items-center gap-2 h-9 w-full px-3 rounded-lg border bg-card text-sm transition-colors cursor-text",
          open ? "border-blue-500 ring-2 ring-blue-100" : "border-input hover:border-border",
          disabled && "opacity-50 cursor-not-allowed",
          triggerClassName,
        )}
      >
        <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          data-lpignore="true"
          data-1p-ignore=""
          disabled={disabled}
          value={text}
          placeholder={placeholder}
          maxLength={5}
          onChange={(e) => handleType(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape" || e.key === "Enter") setOpen(false); }}
          className="min-w-0 w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
        {allowClear && value && !disabled && (
          <button type="button" onClick={clear} className="text-muted-foreground/60 hover:text-muted-foreground shrink-0 cursor-pointer" title="Sem hora">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {mounted && open && createPortal(
        <div
          ref={popoverRef}
          style={{ position: "fixed", zIndex: 9999, ...popStyle }}
          className="bg-card rounded-xl border border-border shadow-xl py-1 w-[140px]"
        >
          <div ref={listRef} className="max-h-56 overflow-y-auto">
            {SLOTS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => pick(s)}
                className={cn(
                  "w-full text-left px-3 py-1 text-sm hover:bg-muted transition-colors",
                  s === value ? "bg-muted font-semibold text-foreground" : "text-foreground"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
