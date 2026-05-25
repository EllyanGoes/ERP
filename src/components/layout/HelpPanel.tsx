"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Mail, MessageCircle, BookOpen, Keyboard } from "lucide-react";
import { useShortcuts } from "@/lib/shortcuts-context";

// ── Shortcut definitions ───────────────────────────────────────────────────────
const SHORTCUT_SECTIONS = [
  {
    title: "Navegação",
    items: [
      { keys: ["⌘", "K"],  description: "Abrir paleta de navegação rápida" },
      { keys: ["⌘", "R"],  description: "Recarregar a aba atual" },
      { keys: ["⌘", "B"],  description: "Recolher / expandir a sidebar" },
      { keys: ["?"],        description: "Abrir este painel de ajuda" },
      { keys: ["Esc"],      description: "Fechar janela ou diálogo aberto" },
    ],
  },
  {
    title: "Paleta ⌘K",
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

// ── Component ──────────────────────────────────────────────────────────────────
export default function HelpPanel() {
  const { open, openShortcuts, closeShortcuts } = useShortcuts();

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
        className={`fixed top-0 right-0 z-[9101] h-full w-[420px] bg-white shadow-2xl border-l border-gray-200 flex flex-col transition-transform duration-300 ease-in-out ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Ajuda & Suporte</h2>
          <button
            onClick={closeShortcuts}
            className="flex items-center justify-center h-8 w-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Suporte ─────────────────────────────────────────────────── */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-4">
              Suporte
            </p>

            <div className="space-y-3">
              <SupportCard
                icon={<MessageCircle className="h-4 w-4 text-blue-600" />}
                title="Abrir chamado"
                description="Reporte um problema ou solicite uma funcionalidade"
                href="mailto:suporte@erpsigma.com.br?subject=Chamado ERP"
                bg="bg-blue-50"
              />
              <SupportCard
                icon={<Mail className="h-4 w-4 text-emerald-600" />}
                title="Falar por e-mail"
                description="suporte@erpsigma.com.br"
                href="mailto:suporte@erpsigma.com.br"
                bg="bg-emerald-50"
              />
              <SupportCard
                icon={<BookOpen className="h-4 w-4 text-violet-600" />}
                title="Documentação"
                description="Guias e tutoriais do sistema"
                href="#"
                bg="bg-violet-50"
              />
            </div>
          </div>

          {/* ── Atalhos ──────────────────────────────────────────────────── */}
          <div className="px-6 py-5">
            <div className="flex items-center gap-2 mb-4">
              <Keyboard className="h-3.5 w-3.5 text-gray-400" />
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                Atalhos do teclado
              </p>
            </div>

            <div className="space-y-6">
              {SHORTCUT_SECTIONS.map((section) => (
                <div key={section.title}>
                  <p className="text-xs font-medium text-gray-500 mb-2">{section.title}</p>
                  <div className="space-y-1">
                    {section.items.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-4 rounded-lg px-3 py-2.5 hover:bg-gray-50 transition-colors"
                      >
                        <span className="text-sm text-gray-700">{item.description}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {item.keys.map((k, ki) => (
                            <span key={ki} className="flex items-center gap-1">
                              {ki > 0 && <span className="text-[10px] text-gray-300">+</span>}
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
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 shrink-0">
          <p className="text-[11px] text-gray-400 text-center">
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
  return (
    <a
      href={href}
      target={href.startsWith("mailto") ? undefined : "_blank"}
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all group"
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${bg}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800 group-hover:text-blue-600 transition-colors">{title}</p>
        <p className="text-xs text-gray-400 truncate">{description}</p>
      </div>
    </a>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-gray-600 shadow-sm min-w-[22px]">
      {children}
    </kbd>
  );
}
