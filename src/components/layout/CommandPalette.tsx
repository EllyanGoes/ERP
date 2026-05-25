"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Search, X,
  GitBranch, UserCheck, Layers, Users,
  Package, Tag, Ruler, MapPin,
  Truck, CalendarDays, CreditCard, CircleDot,
  ShoppingCart,
  PackageSearch, ArrowLeftRight, ClipboardList, ClipboardCheck,
  FileBarChart2, PieChart, BarChart3, Activity,
  ThumbsUp, FileSearch, FilePlus, PackageCheck,
  TrendingUp, TrendingDown,
  UserCog, ShieldCheck,
  Settings2, Plug,
  LayoutDashboard,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ── Route registry ─────────────────────────────────────────────────────────────
type Route = {
  href:    string;
  label:   string;
  group:   string;
  section: string;
  icon:    LucideIcon;
  keywords?: string;
};

const ROUTES: Route[] = [
  // Dashboard
  { href: "/",                              label: "Dashboard",               group: "Início",         section: "Geral",             icon: LayoutDashboard },

  // Empresa — Geral
  { href: "/empresa/filiais",               label: "Filiais",                 group: "Empresa",        section: "Geral",             icon: GitBranch },
  { href: "/empresa/colaboradores",         label: "Colaboradores",           group: "Empresa",        section: "Geral",             icon: UserCheck },
  { href: "/empresa/setores",               label: "Setores",                 group: "Empresa",        section: "Geral",             icon: Layers },
  { href: "/clientes",                      label: "Clientes",                group: "Empresa",        section: "Geral",             icon: Users },

  // Empresa — Almoxarifado (cadastros)
  { href: "/suprimentos/produtos",          label: "Produtos",                group: "Empresa",        section: "Almoxarifado",      icon: Package },
  { href: "/suprimentos/tipos-produto",     label: "Tipos de Produto",        group: "Empresa",        section: "Almoxarifado",      icon: Tag },
  { href: "/suprimentos/unidades",          label: "Unidades de Medida",      group: "Empresa",        section: "Almoxarifado",      icon: Ruler },
  { href: "/suprimentos/locais-estoque",    label: "Locais de Estoque",       group: "Empresa",        section: "Almoxarifado",      icon: MapPin },

  // Empresa — Compras (cadastros)
  { href: "/suprimentos/fornecedores",      label: "Fornecedores",            group: "Empresa",        section: "Compras",           icon: Truck },
  { href: "/suprimentos/condicoes-pagamento", label: "Condições de Pagamento", group: "Empresa",      section: "Compras",           icon: CalendarDays },
  { href: "/suprimentos/formas-pagamento",  label: "Formas de Pagamento",     group: "Empresa",        section: "Compras",           icon: CreditCard },

  // Empresa — Financeiro (cadastros)
  { href: "/empresa/centros-custo",         label: "Centros de Custo",        group: "Empresa",        section: "Financeiro",        icon: CircleDot },

  // Comercial
  { href: "/pedidos-venda",                 label: "Pedidos de Venda",        group: "Comercial",      section: "Processos",         icon: ShoppingCart },

  // Almoxarifado — Estoque
  { href: "/suprimentos/estoque",           label: "Posição de Estoque",      group: "Almoxarifado",   section: "Estoque",           icon: PackageSearch },
  { href: "/suprimentos/movimentacoes",     label: "Movimentações",           group: "Almoxarifado",   section: "Estoque",           icon: ArrowLeftRight },
  { href: "/suprimentos/requisicoes-materiais", label: "Req/Dev de Materiais", group: "Almoxarifado",  section: "Estoque",           icon: ClipboardList,  keywords: "requisição devolução materiais" },
  { href: "/suprimentos/inventarios-materiais", label: "Inventário",          group: "Almoxarifado",   section: "Estoque",           icon: ClipboardCheck },

  // Almoxarifado — Relatórios
  { href: "/suprimentos/relatorios/movimentacoes", label: "Entradas e Saídas", group: "Almoxarifado", section: "Relatórios",         icon: FileBarChart2 },
  { href: "/suprimentos/relatorios/curva-abc",     label: "Curva ABC",          group: "Almoxarifado", section: "Relatórios",         icon: PieChart },
  { href: "/suprimentos/relatorios/imd",           label: "IMD — Demandas",     group: "Almoxarifado", section: "Relatórios",         icon: BarChart3,      keywords: "imd demandas" },
  { href: "/suprimentos/relatorios/consumo",       label: "Análise de Consumo", group: "Almoxarifado", section: "Relatórios",         icon: Activity },

  // Compras
  { href: "/aprovacoes",                    label: "Minhas Aprovações",       group: "Compras",        section: "Aprovações",        icon: ThumbsUp },
  { href: "/compras/necessidades",          label: "Solicitação de Compras",  group: "Compras",        section: "Fluxo de Compras",  icon: ClipboardList,  keywords: "SC necessidade" },
  { href: "/suprimentos/cotacoes",          label: "Cotação de Compras",      group: "Compras",        section: "Fluxo de Compras",  icon: FileSearch,     keywords: "CT cotação" },
  { href: "/suprimentos/pedidos-compra",    label: "Pedido de Compras",       group: "Compras",        section: "Fluxo de Compras",  icon: FilePlus,       keywords: "PC pedido" },
  { href: "/suprimentos/conferencias",      label: "Doc. de Entrada",         group: "Compras",        section: "Fluxo de Compras",  icon: PackageCheck,   keywords: "DE conferência entrada NF" },

  // Financeiro
  { href: "/contas-receber",                label: "Contas a Receber",        group: "Financeiro",     section: "Processos",         icon: TrendingUp },
  { href: "/contas-pagar",                  label: "Contas a Pagar",          group: "Financeiro",     section: "Processos",         icon: TrendingDown },
  { href: "/fluxo-caixa",                   label: "Fluxo de Caixa",          group: "Financeiro",     section: "Processos",         icon: BarChart3 },

  // Administração
  { href: "/admin/usuarios",                label: "Usuários",                group: "Administração",  section: "Sistema",           icon: UserCog },
  { href: "/admin/perfis",                  label: "Perfis de Acesso",        group: "Administração",  section: "Sistema",           icon: ShieldCheck },

  // Configurações
  { href: "/configuracoes/aprovacoes",      label: "Aprovações",              group: "Configurações",  section: "Configurações",     icon: Settings2 },
  { href: "/configuracoes/integracoes",     label: "Integrações",             group: "Configurações",  section: "Configurações",     icon: Plug },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function normalize(str: string) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function score(route: Route, q: string): number {
  const nq = normalize(q);
  const nl = normalize(route.label);
  const ng = normalize(route.group);
  const ns = normalize(route.section);
  const nk = normalize(route.keywords ?? "");
  if (nl.startsWith(nq)) return 4;
  if (nl.includes(nq))   return 3;
  if (ng.includes(nq) || ns.includes(nq)) return 2;
  if (nk.includes(nq))  return 1;
  return 0;
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function CommandPalette() {
  const [open,     setOpen]     = useState(false);
  const [query,    setQuery]    = useState("");
  const [selected, setSelected] = useState(0);
  const [mounted,  setMounted]  = useState(false);
  const inputRef   = useRef<HTMLInputElement>(null);
  const listRef    = useRef<HTMLDivElement>(null);
  const router     = useRouter();

  useEffect(() => { setMounted(true); }, []);

  // ── Keyboard global listener ─────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => { if (!o) { setQuery(""); setSelected(0); } return !o; });
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  // ── Filtered results ─────────────────────────────────────────────────────────
  const results = useMemo(() => {
    if (!query.trim()) return ROUTES;
    return ROUTES
      .map((r) => ({ r, s: score(r, query.trim()) }))
      .filter(({ s }) => s > 0)
      .sort((a, b) => b.s - a.s)
      .map(({ r }) => r);
  }, [query]);

  // Reset selection when results change
  useEffect(() => { setSelected(0); }, [results]);

  // ── Grouped results (only when no query) ─────────────────────────────────────
  const groups = useMemo(() => {
    if (query.trim()) return null;
    const map = new Map<string, Route[]>();
    for (const r of results) {
      if (!map.has(r.group)) map.set(r.group, []);
      map.get(r.group)!.push(r);
    }
    return map;
  }, [results, query]);

  // ── Navigation ───────────────────────────────────────────────────────────────
  const navigate = useCallback((href: string) => {
    setOpen(false);
    router.push(href);
  }, [router]);

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && results[selected]) navigate(results[selected].href);
  }

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selected}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[9000] bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Panel */}
      {open && (
        <div className="fixed inset-0 z-[9001] flex items-start justify-center pt-[15vh] px-4 pointer-events-none">
          <div
            className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
              <Search className="h-4 w-4 shrink-0 text-gray-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Buscar tela ou processo…"
                className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 outline-none"
              />
              {query && (
                <button onClick={() => setQuery("")} className="text-gray-400 hover:text-gray-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <kbd className="hidden sm:flex items-center gap-0.5 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-400 font-mono">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[420px] overflow-y-auto py-2">
              {results.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-400">Nenhum resultado encontrado.</p>
              ) : groups ? (
                // Grouped view (no query)
                Array.from(groups.entries()).map(([group, items]) => (
                  <div key={group}>
                    <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                      {group}
                    </p>
                    {items.map((route) => {
                      const idx = results.indexOf(route);
                      return (
                        <RouteItem
                          key={route.href}
                          route={route}
                          idx={idx}
                          selected={selected === idx}
                          onHover={() => setSelected(idx)}
                          onClick={() => navigate(route.href)}
                          showSection
                        />
                      );
                    })}
                  </div>
                ))
              ) : (
                // Flat filtered view
                results.map((route, idx) => (
                  <RouteItem
                    key={route.href}
                    route={route}
                    idx={idx}
                    selected={selected === idx}
                    onHover={() => setSelected(idx)}
                    onClick={() => navigate(route.href)}
                    showGroup
                  />
                ))
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-4 border-t border-gray-100 px-4 py-2.5 text-[10px] text-gray-400">
              <span className="flex items-center gap-1">
                <KbdKey>↑</KbdKey><KbdKey>↓</KbdKey> navegar
              </span>
              <span className="flex items-center gap-1">
                <KbdKey>↵</KbdKey> abrir
              </span>
              <span className="flex items-center gap-1">
                <KbdKey>⌘K</KbdKey> abrir/fechar
              </span>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function RouteItem({
  route, idx, selected, onHover, onClick, showSection, showGroup,
}: {
  route: Route;
  idx: number;
  selected: boolean;
  onHover: () => void;
  onClick: () => void;
  showSection?: boolean;
  showGroup?: boolean;
}) {
  const Icon = route.icon;
  return (
    <button
      data-idx={idx}
      onClick={onClick}
      onMouseEnter={onHover}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
        selected ? "bg-blue-50" : "hover:bg-gray-50"
      )}
    >
      <span className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
        selected ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"
      )}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className={cn("block truncate text-sm font-medium", selected ? "text-blue-700" : "text-gray-800")}>
          {route.label}
        </span>
        {(showSection || showGroup) && (
          <span className="block truncate text-[11px] text-gray-400">
            {showGroup && route.group}
            {showGroup && showSection && " · "}
            {showSection && route.section}
          </span>
        )}
      </span>
      {selected && (
        <span className="shrink-0 text-[10px] text-blue-400 font-medium">Abrir</span>
      )}
    </button>
  );
}

function KbdKey({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-gray-200 bg-gray-100 px-1 py-0.5 font-mono text-[10px] text-gray-500">
      {children}
    </kbd>
  );
}
