"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X, Mail, MessageCircle, BookOpen, Keyboard } from "lucide-react";
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
export default function HelpPanel() {
  const { open, openShortcuts, closeShortcuts } = useShortcuts();
  const mod = useModKey();

  const SHORTCUT_SECTIONS = [
    {
      title: "Navegação",
      items: [
        { keys: [mod, "K"],  description: "Abrir paleta de navegação rápida" },
        { keys: [mod, "R"],  description: "Recarregar a aba atual" },
        { keys: [mod, "B"],  description: "Recolher / expandir a sidebar" },
        { keys: ["?"],        description: "Abrir este painel de ajuda" },
        { keys: ["Esc"],      description: "Fechar janela ou diálogo aberto" },
      ],
    },
    {
      title: `Paleta ${mod}+K`,
      items: [
        { keys: ["↑", "↓"],  description: "Navegar entre resultados" },
        { keys: ["↵"],        description: "Abrir a tela selecionada" },
        { keys: ["Esc"],      description: "Fechar a paleta" },
      ],
    },
    {
      title: "Geral",
      items: [
        { keys: ["Tab"],      description: "Navegar entre campos do formulário" },
      ],
    },
  ];

  // Global ? key listener
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "?") { e.preventDefault(); open ? closeShortcuts() : openShortcuts(); }
      if (e.key === "Escape" && open) closeShortcuts();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, openShortcuts, closeShortcuts]);

  if (typeof window === "undefined") return null;

  return createPortal(
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-[9100] bg-black/30 backdrop-blur-[2px] transition-opacity duration-300 ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={closeShortcuts}
      />

      {/* Panel — slides in from the right */}
      <div
        className={`fixed top-0 right-0 z-[9101] h-full w-[420px] bg-card shadow-2xl border-l border-border flex flex-col transition-transform duration-300 ease-in-out ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border shrink-0">
          <h2 className="text-base font-semibold text-foreground">Ajuda & Suporte</h2>
          <button
            onClick={closeShortcuts}
            className="flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Suporte ─────────────────────────────────────────────────── */}
          <div className="px-6 py-5 border-b border-border">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">
              Suporte
            </p>

            <div className="space-y-3">
              <SupportCard
                icon={<MessageCircle className="h-4 w-4 text-info" />}
                title="Abrir chamado"
                description="Reporte um problema ou solicite uma funcionalidade"
                href="/suporte"
                bg="bg-info/10"
              />
              <SupportCard
                icon={<Mail className="h-4 w-4 text-success" />}
                title="Falar por e-mail"
                description="suporte@erpsigma.com.br"
                href="mailto:suporte@erpsigma.com.br"
                bg="bg-success/10"
              />
              <SupportCard
                icon={<BookOpen className="h-4 w-4 text-violet-600" />}
                title="Documentação"
                description="Processos do sistema em BPMN, módulo a módulo"
                href="/documentacao"
                bg="bg-violet-50"
              />
            </div>
          </div>

          {/* ── Atalhos ──────────────────────────────────────────────────── */}
          <div className="px-6 py-5">
            <div className="flex items-center gap-2 mb-4">
              <Keyboard className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Atalhos do teclado
              </p>
            </div>

            <div className="space-y-6">
              {SHORTCUT_SECTIONS.map((section) => (
                <div key={section.title}>
                  <p className="text-xs font-medium text-muted-foreground mb-2">{section.title}</p>
                  <div className="space-y-1">
                    {section.items.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-4 rounded-lg px-3 py-2.5 hover:bg-muted transition-colors"
                      >
                        <span className="text-sm text-foreground">{item.description}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {item.keys.map((k, ki) => (
                            <span key={ki} className="flex items-center gap-1">
                              {ki > 0 && <span className="text-[10px] text-muted-foreground/60">+</span>}
                              <Kbd>{k}</Kbd>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-muted shrink-0">
          <p className="text-[11px] text-muted-foreground text-center">
            Pressione <Kbd>?</Kbd> a qualquer momento para abrir este painel
          </p>
        </div>
      </div>
    </>,
    document.body
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SupportCard({ icon, title, description, href, bg }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  bg: string;
}) {
  const cls = "flex items-center gap-3 p-3.5 rounded-xl border border-border hover:border-border hover:shadow-sm transition-all group";
  const content = (
    <>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${bg}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground group-hover:text-info transition-colors">{title}</p>
        <p className="text-xs text-muted-foreground truncate">{description}</p>
      </div>
    </>
  );

  if (href.startsWith("/")) {
    return <Link href={href} className={cls}>{content}</Link>;
  }
  return (
    <a href={href} target={href.startsWith("mailto") ? undefined : "_blank"} rel="noopener noreferrer" className={cls}>
      {content}
    </a>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground shadow-sm min-w-[22px]">
      {children}
    </kbd>
  );
}
