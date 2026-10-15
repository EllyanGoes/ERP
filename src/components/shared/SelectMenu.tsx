"use client";
// Dropdown PADRÃO do sistema para escolhas fixas (enum/filtro/lista curta) —
// substitui o <select> nativo em TODAS as telas (decisão de produto 13/08/2026:
// o popup nativo do navegador destoa do visual; o modelo é o do seletor de
// empresas do topo). Para listas de entidades com busca/criação continue usando
// ComboboxWithCreate.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectMenuOption = {
  value: string;
  label: string;
  /** Render custom da linha (ex.: ícone + texto). Default: label. */
  render?: () => React.ReactNode;
};

export default function SelectMenu({
  value,
  options,
  onChange,
  placeholder = "Selecionar…",
  className,
  triggerClassName,
  menuClassName,
  disabled,
  title,
}: {
  value: string;
  options: SelectMenuOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // Menu em portal com position:fixed (mesmo padrão do ComboboxWithCreate):
  // escapa do overflow de dialogs/tabelas, que cortavam as opções. Posição
  // calculada pelo gatilho e travada na janela — abre para cima e alinha pela
  // direita quando não cabe.
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; minWidth: number; maxHeight: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const calcular = useCallback(() => {
    const host = ref.current;
    if (!host) return;
    const r = host.getBoundingClientRect();
    const M = 8, MAX_H = 288;
    const largura = menuRef.current?.offsetWidth ?? r.width;
    const abaixo = window.innerHeight - r.bottom - M, acima = r.top - M;
    const cima = abaixo < Math.min(MAX_H, (menuRef.current?.scrollHeight ?? MAX_H)) && acima > abaixo;
    const left = Math.max(M, Math.min(r.left, window.innerWidth - largura - M));
    setPos(cima
      ? { bottom: window.innerHeight - r.top + 4, left, minWidth: r.width, maxHeight: Math.min(MAX_H, acima) }
      : { top: r.bottom + 4, left, minWidth: r.width, maxHeight: Math.min(MAX_H, abaixo) });
  }, []);

  // 1º cálculo antes do paint; o 2º usa a largura real do menu já montado.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    calcular();
    const raf = requestAnimationFrame(calcular);
    window.addEventListener("scroll", calcular, true);
    window.addEventListener("resize", calcular);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", calcular, true); window.removeEventListener("resize", calcular); };
  }, [open, calcular]);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const atual = options.find((o) => o.value === value);

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        type="button"
        disabled={disabled}
        title={title}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "h-9 w-full flex items-center justify-between gap-1.5 rounded-lg border border-border bg-card px-2.5 text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-60",
          triggerClassName,
        )}
      >
        <span className={cn("truncate", !atual && "text-muted-foreground")}>{atual?.label ?? placeholder}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" />
      </button>
      {mounted && open && createPortal(
        <div ref={menuRef} style={{ position: "fixed", zIndex: 9999, top: pos?.top, bottom: pos?.bottom, left: pos?.left ?? 0, minWidth: pos?.minWidth, maxHeight: pos?.maxHeight, visibility: pos ? "visible" : "hidden" }} className={cn(
          "w-max max-w-80 overflow-y-auto bg-card border border-border rounded-xl shadow-xl py-1",
          menuClassName,
        )}>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className="w-full flex items-center gap-2 pl-2.5 pr-3.5 py-1.5 text-sm text-foreground text-left hover:bg-muted"
            >
              <Check className={cn("w-3.5 h-3.5 shrink-0 text-info", o.value === value ? "opacity-100" : "opacity-0")} />
              <span className="truncate">{o.render ? o.render() : o.label}</span>
            </button>
          ))}
          {options.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Nenhuma opção.</p>}
        </div>,
        document.body,
      )}
    </div>
  );
}
