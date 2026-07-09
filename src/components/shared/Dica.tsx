"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Tooltip no MESMO padrão do da sidebar (StripTooltip): portal, delay de 300ms,
// caixa bg-popover com borda e sombra — mas abrindo PARA BAIXO (p/ abas e botões
// em linhas horizontais). Use no lugar do title= nativo quando o visual importa.
export default function Dica({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  function handleEnter() {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({ top: r.bottom + 8, left: r.left + r.width / 2 });
    }
    timerRef.current = setTimeout(() => setVisible(true), 300);
  }
  function handleLeave() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }

  return (
    <div ref={ref} onMouseEnter={handleEnter} onMouseLeave={handleLeave} className="inline-flex">
      {children}
      {mounted && visible && createPortal(
        <div className="fixed z-[9999] pointer-events-none" style={{ top: pos.top, left: pos.left, transform: "translateX(-50%)" }}>
          <div className="bg-popover text-popover-foreground text-xs font-medium px-3 py-1.5 rounded-lg whitespace-nowrap shadow-[0_4px_16px_rgba(0,0,0,0.10)] border border-border">
            {label}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
