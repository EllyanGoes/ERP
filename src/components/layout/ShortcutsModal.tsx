"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useShortcuts } from "@/lib/shortcuts-context";

function useModKey() {
  const [mod, setMod] = useState("⌘");
  useEffect(() => {
    if (typeof navigator !== "undefined" && !/Mac|iPhone|iPad|iPod/.test(navigator.platform)) {
      setMod("Ctrl");
    }
  }, []);
  return mod;
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function ShortcutsModal() {
  const { open, openShortcuts, closeShortcuts } = useShortcuts();
  const mod = useModKey();

  const SECTIONS = [
    {
      title: "Navegação",
      items: [
        { keys: [mod, "K"],     description: "Abrir paleta de navegação rápida" },
        { keys: [mod, "B"],     description: "Recolher / expandir a sidebar" },
        { keys: ["?"],           description: "Ver atalhos do teclado (esta janela)" },
        { keys: ["Esc"],         description: "Fechar janela ou diálogo aberto" },
      ],
    },
    {
      title: `Paleta de Navegação (${mod}+K)`,
      items: [
        { keys: ["↑", "↓"],     description: "Navegar entre os resultados" },
        { keys: ["↵"],           description: "Abrir a tela selecionada" },
        { keys: ["Esc"],         description: "Fechar a paleta" },
      ],
    },
    {
      title: "Geral",
      items: [
        { keys: [mod, "↵"],     description: "Confirmar / salvar formulário (quando disponível)" },
        { keys: ["Tab"],         description: "Navegar entre campos do formulário" },
      ],
    },
  ];

  // Global ? key listener
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      // Don't trigger when typing in inputs
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "?") { e.preventDefault(); open ? closeShortcuts() : openShortcuts(); }
      if (e.key === "Escape" && open) closeShortcuts();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, openShortcuts, closeShortcuts]);

  if (!open || typeof window === "undefined") return null;

  return createPortal(
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[9100] bg-black/40 backdrop-blur-sm"
        onClick={closeShortcuts}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[9101] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="w-full max-w-lg bg-card rounded-2xl shadow-2xl border border-border overflow-hidden pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Atalhos do Teclado</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Pressione <Kbd>?</Kbd> a qualquer momento para abrir esta janela</p>
            </div>
            <button
              onClick={closeShortcuts}
              className="flex items-center justify-center h-7 w-7 rounded-lg text-muted-foreground hover:text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Sections */}
          <div className="divide-y divide-border max-h-[70vh] overflow-y-auto">
            {SECTIONS.map((section) => (
              <div key={section.title} className="px-5 py-4 space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {section.title}
                </p>
                {section.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">{item.description}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.keys.map((k, ki) => (
                        <span key={ki} className="flex items-center gap-1">
                          {ki > 0 && item.keys.length > 1 && (
                            <span className="text-[10px] text-muted-foreground/60">+</span>
                          )}
                          {k === "+" ? null : <Kbd>{k}</Kbd>}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-border bg-muted text-[11px] text-muted-foreground text-center">
            Mais atalhos serão adicionados conforme o sistema evolui
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-foreground shadow-sm min-w-[24px]">
      {children}
    </kbd>
  );
}
