"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Search, X, Clock, ExternalLink,
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
  href:     string;
  label:    string;
  group:    string;
  section:  string;
  icon:     LucideIcon;
  keywords?: string;
};

const ROUTES: Route[] = [
  { href: "/",                                     label: "Dashboard",               group: "Início",         section: "Geral",            icon: LayoutDashboard },

  { href: "/empresa/filiais",                      label: "Filiais",                 group: "Empresa",        section: "Geral",            icon: GitBranch },
  { href: "/empresa/colaboradores",                label: "Colaboradores",           group: "Empresa",        section: "Geral",            icon: UserCheck },
  { href: "/empresa/setores",                      label: "Setores",                 group: "Empresa",        section: "Geral",            icon: Layers },
  { href: "/clientes",                             label: "Clientes",                group: "Empresa",        section: "Geral",            icon: Users },

  { href: "/suprimentos/produtos",                 label: "Produtos",                group: "Empresa",        section: "Almoxarifado",     icon: Package },
  { href: "/suprimentos/tipos-produto",            label: "Tipos de Produto",        group: "Empresa",        section: "Almoxarifado",     icon: Tag },
  { href: "/suprimentos/unidades",                 label: "Unidades de Medida",      group: "Empresa",        section: "Almoxarifado",     icon: Ruler },
  { href: "/suprimentos/locais-estoque",           label: "Locais de Estoque",       group: "Empresa",        section: "Almoxarifado",     icon: MapPin },

  { href: "/suprimentos/fornecedores",             label: "Fornecedores",            group: "Empresa",        section: "Compras",          icon: Truck },
  { href: "/suprimentos/condicoes-pagamento",      label: "Condições de Pagamento",  group: "Empresa",        section: "Compras",          icon: CalendarDays },
  { href: "/suprimentos/formas-pagamento",         label: "Formas de Pagamento",     group: "Empresa",        section: "Compras",          icon: CreditCard },
  { href: "/empresa/centros-custo",                label: "Centros de Custo",        group: "Empresa",        section: "Financeiro",       icon: CircleDot },

  { href: "/pedidos-venda",                        label: "Pedidos de Venda",        group: "Comercial",      section: "Processos",        icon: ShoppingCart },

  { href: "/suprimentos/estoque",                  label: "Posição de Estoque",      group: "Almoxarifado",   section: "Estoque",          icon: PackageSearch },
  { href: "/suprimentos/movimentacoes",            label: "Movimentações",           group: "Almoxarifado",   section: "Estoque",          icon: ArrowLeftRight },
  { href: "/suprimentos/requisicoes-materiais",    label: "Req/Dev de Materiais",    group: "Almoxarifado",   section: "Estoque",          icon: ClipboardList,   keywords: "requisição devolução materiais" },
  { href: "/suprimentos/inventarios-materiais",    label: "Inventário",              group: "Almoxarifado",   section: "Estoque",          icon: ClipboardCheck },

  { href: "/suprimentos/relatorios/movimentacoes", label: "Entradas e Saídas",       group: "Almoxarifado",   section: "Relatórios",       icon: FileBarChart2 },
  { href: "/suprimentos/relatorios/curva-abc",     label: "Curva ABC",               group: "Almoxarifado",   section: "Relatórios",       icon: PieChart },
  { href: "/suprimentos/relatorios/imd",           label: "IMD — Demandas",          group: "Almoxarifado",   section: "Relatórios",       icon: BarChart3,       keywords: "imd demandas" },
  { href: "/suprimentos/relatorios/consumo",       label: "Análise de Consumo",      group: "Almoxarifado",   section: "Relatórios",       icon: Activity },

  { href: "/aprovacoes",                           label: "Minhas Aprovações",       group: "Compras",        section: "Aprovações",       icon: ThumbsUp },
  { href: "/compras/necessidades",                 label: "Solicitação de Compras",  group: "Compras",        section: "Fluxo de Compras", icon: ClipboardList,   keywords: "SC necessidade" },
  { href: "/suprimentos/cotacoes",                 label: "Cotação de Compras",      group: "Compras",        section: "Fluxo de Compras", icon: FileSearch,      keywords: "CT cotação" },
  { href: "/suprimentos/pedidos-compra",           label: "Pedido de Compras",       group: "Compras",        section: "Fluxo de Compras", icon: FilePlus,        keywords: "PC pedido" },
  { href: "/suprimentos/conferencias",             label: "Doc. de Entrada",         group: "Compras",        section: "Fluxo de Compras", icon: PackageCheck,    keywords: "DE conferência entrada NF nota fiscal" },

  { href: "/contas-receber",                       label: "Contas a Receber",        group: "Financeiro",     section: "Processos",        icon: TrendingUp },
  { href: "/contas-pagar",                         label: "Contas a Pagar",          group: "Financeiro",     section: "Processos",        icon: TrendingDown },
  { href: "/fluxo-caixa",                          label: "Fluxo de Caixa",          group: "Financeiro",     section: "Processos",        icon: BarChart3 },

  { href: "/admin/usuarios",                       label: "Usuários",                group: "Administração",  section: "Sistema",          icon: UserCog },
  { href: "/admin/perfis",                         label: "Perfis de Acesso",        group: "Administração",  section: "Sistema",          icon: ShieldCheck },

  { href: "/configuracoes/aprovacoes",             label: "Aprovações",              group: "Configurações",  section: "Configurações",    icon: Settings2 },
  { href: "/configuracoes/integracoes",            label: "Integrações",             group: "Configurações",  section: "Configurações",    icon: Plug },
];

const ROUTE_MAP = new Map(ROUTES.map((r) => [r.href, r]));
const RECENTS_KEY = "cmd-palette-recents";
const MAX_RECENTS = 6;

// ── Helpers ────────────────────────────────────────────────────────────────────
function normalize(str: string) {
  return str.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function score(route: Route, q: string): number {
  const nq = normalize(q);
  if (normalize(route.label).startsWith(nq))                           return 4;
  if (normalize(route.label).includes(nq))                             return 3;
  if (normalize(route.group).includes(nq) || normalize(route.section).includes(nq)) return 2;
  if (normalize(route.keywords ?? "").includes(nq))                    return 1;
  return 0;
}

function loadRecents(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]"); }
  catch { return []; }
}

function saveRecent(href: string) {
  const prev = loadRecents().filter((h) => h !== href);
  localStorage.setItem(RECENTS_KEY, JSON.stringify([href, ...prev].slice(0, MAX_RECENTS)));
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function CommandPalette() {
  const [open,     setOpen]     = useState(false);
  const [query,    setQuery]    = useState("");
  const [selected, setSelected] = useState(0);
  const [mounted,  setMounted]  = useState(false);
  const [recents,  setRecents]  = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => { setMounted(true); }, []);

  // Track page visits as recents
  useEffect(() => {
    if (!pathname) return;
    saveRecent(pathname);
  }, [pathname]);

  // ── Keyboard listener ──────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => {
          if (!o) {
            setQuery("");
            setSelected(0);
            setRecents(loadRecents());
          }
          return !o;
        });
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  // ── Results ────────────────────────────────────────────────────────────────
  const filteredResults = useMemo(() => {
    if (!query.trim()) return ROUTES;
    return ROUTES
      .map((r) => ({ r, s: score(r, query.trim()) }))
      .filter(({ s }) => s > 0)
      .sort((a, b) => b.s - a.s)
      .map(({ r }) => r);
  }, [query]);

  // Flat list used for keyboard index
  const flatList = useMemo(() => {
    if (query.trim()) return filteredResults;
    // Recents first, then all routes (deduped)
    const recentRoutes = recents.flatMap((h) => { const r = ROUTE_MAP.get(h); return r ? [r] : []; });
    const recentHrefs  = new Set(recentRoutes.map((r) => r.href));
    return [...recentRoutes, ...ROUTES.filter((r) => !recentHrefs.has(r.href))];
  }, [filteredResults, recents, query]);

  useEffect(() => { setSelected(0); }, [flatList]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const navigate = useCallback((href: string, newTab = false) => {
    saveRecent(href);
    setOpen(false);
    if (newTab) { window.open(href, "_blank"); return; }
    router.push(href);
  }, [router]);

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, flatList.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && flatList[selected]) navigate(flatList[selected].href);
  }

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selected}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  // ── Grouped no-query view ──────────────────────────────────────────────────
  const sections = useMemo(() => {
    if (query.trim()) return null;
    const recentRoutes = recents.flatMap((h) => { const r = ROUTE_MAP.get(h); return r ? [r] : []; });
    const recentHrefs  = new Set(recentRoutes.map((r) => r.href));

    const groups = new Map<string, Route[]>();
    if (recentRoutes.length > 0) groups.set("__recents__", recentRoutes);
    for (const r of ROUTES.filter((r) => !recentHrefs.has(r.href))) {
      if (!groups.has(r.group)) groups.set(r.group, []);
      groups.get(r.group)!.push(r);
    }
    return groups;
  }, [recents, query]);

  if (!mounted) return null;

  return createPortal(
    <>
      {open && (
        <div className="fixed inset-0 z-[9000] bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      )}

      {open && (
        <div className="fixed inset-0 z-[9001] flex items-start justify-center pt-[14vh] px-4 pointer-events-none">
          <div
            className="w-full max-w-[600px] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Search bar ─────────────────────────────────────────────── */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
              <Search className="h-4 w-4 shrink-0 text-gray-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Pesquise ou navegue para uma tela…"
                className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 outline-none"
              />
              {query ? (
                <button onClick={() => setQuery("")} className="rounded p-0.5 text-gray-400 hover:text-gray-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <kbd className="hidden sm:flex items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-400 font-mono">
                  ESC
                </kbd>
              )}
            </div>

            {/* ── Results ────────────────────────────────────────────────── */}
            <div ref={listRef} className="max-h-[440px] overflow-y-auto py-1.5">
              {flatList.length === 0 ? (
                <p className="py-12 text-center text-sm text-gray-400">Nenhum resultado encontrado.</p>
              ) : sections ? (
                // Grouped no-query view
                Array.from(sections.entries()).map(([group, items]) => (
                  <div key={group}>
                    <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                      {group === "__recents__"
                        ? <Clock className="h-3 w-3 text-gray-400" />
                        : null}
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                        {group === "__recents__" ? "Recentes" : group}
                      </p>
                    </div>
                    {items.map((route) => {
                      const idx = flatList.indexOf(route);
                      return (
                        <RouteItem
                          key={route.href}
                          route={route}
                          idx={idx}
                          selected={selected === idx}
                          onHover={() => setSelected(idx)}
                          onClick={() => navigate(route.href)}
                          onNewTab={() => navigate(route.href, true)}
                          showSection={group !== "__recents__"}
                          showGroup={group === "__recents__"}
                        />
                      );
                    })}
                  </div>
                ))
              ) : (
                // Flat filtered view
                <>
                  <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                    Resultados
                  </p>
                  {filteredResults.map((route, idx) => (
                    <RouteItem
                      key={route.href}
                      route={route}
                      idx={idx}
                      selected={selected === idx}
                      onHover={() => setSelected(idx)}
                      onClick={() => navigate(route.href)}
                      onNewTab={() => navigate(route.href, true)}
                      showGroup
                      showSection
                    />
                  ))}
                </>
              )}
            </div>

            {/* ── Footer ─────────────────────────────────────────────────── */}
            <div className="flex items-center gap-4 border-t border-gray-100 px-4 py-2 text-[10px] text-gray-400">
              <span className="flex items-center gap-1">
                <KbdKey>↑</KbdKey><KbdKey>↓</KbdKey> navegar
              </span>
              <span className="flex items-center gap-1">
                <KbdKey>↵</KbdKey> abrir
              </span>
              <span className="ml-auto flex items-center gap-1">
                <KbdKey>⌘K</KbdKey> fechar
              </span>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}

// ── RouteItem ─────────────────────────────────────────────────────────────────
function RouteItem({
  route, idx, selected, onHover, onClick, onNewTab, showSection, showGroup,
}: {
  route:       Route;
  idx:         number;
  selected:    boolean;
  onHover:     () => void;
  onClick:     () => void;
  onNewTab:    () => void;
  showSection?: boolean;
  showGroup?:  boolean;
}) {
  const Icon = route.icon;
  const subtitle = [
    showGroup   ? route.group   : null,
    showSection ? route.section : null,
  ].filter(Boolean).join(" · ");

  return (
    <div
      data-idx={idx}
      onMouseEnter={onHover}
      className={cn(
        "group flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
        selected ? "bg-blue-50" : "hover:bg-gray-50"
      )}
    >
      {/* Icon */}
      <span className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
        selected ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"
      )}>
        <Icon className="h-3.5 w-3.5" />
      </span>

      {/* Label + subtitle */}
      <span className="flex-1 min-w-0" onClick={onClick}>
        <span className={cn(
          "block truncate text-sm font-medium",
          selected ? "text-blue-700" : "text-gray-800"
        )}>
          {route.label}
        </span>
        {subtitle && (
          <span className="block truncate text-[11px] text-gray-400">{subtitle}</span>
        )}
      </span>

      {/* Hover actions */}
      <div className={cn(
        "flex items-center gap-1 transition-opacity",
        selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      )}>
        <ActionBtn title="Abrir em nova aba" onClick={(e) => { e.stopPropagation(); onNewTab(); }}>
          <ExternalLink className="h-3.5 w-3.5" />
        </ActionBtn>
        <ActionBtn title="Abrir" onClick={(e) => { e.stopPropagation(); onClick(); }}>
          <KbdKey>↵</KbdKey>
        </ActionBtn>
      </div>
    </div>
  );
}

function ActionBtn({ children, onClick, title }: { children: React.ReactNode; onClick: React.MouseEventHandler; title: string }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex items-center justify-center rounded-md border border-gray-200 bg-white px-1.5 py-1 text-gray-500 shadow-sm hover:bg-gray-50 hover:text-gray-700"
    >
      {children}
    </button>
  );
}

function KbdKey({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="font-mono text-[10px] text-gray-500">{children}</kbd>
  );
}
