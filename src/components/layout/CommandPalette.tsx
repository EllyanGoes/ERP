"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Search, X, Clock, ExternalLink, Package, Users, Truck, ShoppingCart, ClipboardList, type LucideIcon } from "lucide-react";
import { ROUTES, routeColor } from "@/lib/route-registry";
import type { RouteEntry as Route } from "@/lib/route-registry";

const ROUTE_MAP = new Map(ROUTES.map((r) => [r.href, r]));
const RECENTS_KEY = "cmd-palette-recents";
const MAX_RECENTS = 6;

// ── Busca de registros (o Cmd+K vai além das telas) ─────────────────────────────
type SearchResult = {
  tipo: "produto" | "cliente" | "fornecedor" | "pedido-venda" | "pedido-compra";
  id: string;
  titulo: string;
  subtitulo?: string;
  codigo?: string;
  href: string;
};

// Ícone, rótulo e cor (via section do route-registry) por tipo de registro.
const RECORD_META: Record<SearchResult["tipo"], { label: string; icon: LucideIcon; section: string }> = {
  "produto":       { label: "Produto",          icon: Package,       section: "Almoxarifado"     },
  "cliente":       { label: "Cliente",          icon: Users,         section: "Comercial"        },
  "fornecedor":    { label: "Fornecedor",       icon: Truck,         section: "Compras"          },
  "pedido-venda":  { label: "Pedido de Venda",  icon: ShoppingCart,  section: "Comercial"        },
  "pedido-compra": { label: "Pedido de Compra", icon: ClipboardList, section: "Fluxo de Compras" },
};

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
  const [mod,      setMod]      = useState("⌘");
  const [records,        setRecords]        = useState<SearchResult[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);
  const reqId    = useRef(0); // protege contra respostas de busca fora de ordem
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
    if (!/Mac|iPhone|iPad|iPod/.test(navigator.platform)) setMod("Ctrl");
  }, []);

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

  // ── Busca de registros no banco (debounce + proteção contra resposta velha) ──
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setRecords([]); setRecordsLoading(false); return; }

    const id = ++reqId.current;
    const ctrl = new AbortController();
    setRecordsLoading(true);
    const t = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const json = await res.json();
        if (id === reqId.current) {              // só aplica se ainda é a busca mais recente
          setRecords(Array.isArray(json.results) ? json.results : []);
          setRecordsLoading(false);
        }
      } catch {
        if (id === reqId.current) setRecordsLoading(false);
      }
    }, 280);

    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

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
  const flatList = useMemo<(Route | SearchResult)[]>(() => {
    if (query.trim()) return [...filteredResults, ...records]; // telas + registros
    // Recents first, then all routes (deduped)
    const recentRoutes = recents.flatMap((h) => { const r = ROUTE_MAP.get(h); return r ? [r] : []; });
    const recentHrefs  = new Set(recentRoutes.map((r) => r.href));
    return [...recentRoutes, ...ROUTES.filter((r) => !recentHrefs.has(r.href))];
  }, [filteredResults, records, recents, query]);

  // Reseta o destaque ao mudar o texto — não quando os registros chegam (async).
  useEffect(() => { setSelected(0); }, [query]);

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
                placeholder="Pesquise telas, produtos, clientes, pedidos…"
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
              {flatList.length === 0 && !recordsLoading ? (
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
                // Flat filtered view — telas + registros do banco
                <>
                  {filteredResults.length > 0 && (
                    <>
                      <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                        Telas
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

                  {(records.length > 0 || recordsLoading) && (
                    <>
                      <p className="flex items-center gap-2 px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                        Registros
                        {recordsLoading && <span className="normal-case font-normal tracking-normal text-gray-300">carregando…</span>}
                      </p>
                      {records.map((rec, i) => {
                        const idx = filteredResults.length + i;
                        return (
                          <RecordItem
                            key={`${rec.tipo}-${rec.id}`}
                            record={rec}
                            idx={idx}
                            selected={selected === idx}
                            onHover={() => setSelected(idx)}
                            onClick={() => navigate(rec.href)}
                            onNewTab={() => navigate(rec.href, true)}
                          />
                        );
                      })}
                    </>
                  )}
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
                <KbdKey>{mod}K</KbdKey> fechar
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
  const color = routeColor(route.section);
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
        selected ? "bg-gray-50" : "hover:bg-gray-50"
      )}
    >
      {/* Icon */}
      <span className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
        selected ? `${color.selBg} ${color.selText}` : `${color.bg} ${color.text}`
      )}>
        <Icon className="h-4 w-4" />
      </span>

      {/* Label + subtitle */}
      <span className="flex-1 min-w-0" onClick={onClick}>
        <span className={cn(
          "block truncate text-sm font-medium",
          selected ? "text-gray-900" : "text-gray-800"
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

// ── RecordItem (resultado vindo do banco) ───────────────────────────────────────
function RecordItem({
  record, idx, selected, onHover, onClick, onNewTab,
}: {
  record:   SearchResult;
  idx:      number;
  selected: boolean;
  onHover:  () => void;
  onClick:  () => void;
  onNewTab: () => void;
}) {
  const meta     = RECORD_META[record.tipo];
  const Icon     = meta.icon;
  const color    = routeColor(meta.section);
  const subtitle = [meta.label, record.subtitulo].filter(Boolean).join(" · ");

  return (
    <div
      data-idx={idx}
      onMouseEnter={onHover}
      className={cn(
        "group flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
        selected ? "bg-gray-50" : "hover:bg-gray-50"
      )}
    >
      {/* Icon */}
      <span className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
        selected ? `${color.selBg} ${color.selText}` : `${color.bg} ${color.text}`
      )}>
        <Icon className="h-4 w-4" />
      </span>

      {/* Título + subtítulo */}
      <span className="flex-1 min-w-0" onClick={onClick}>
        <span className={cn(
          "block truncate text-sm font-medium",
          selected ? "text-gray-900" : "text-gray-800"
        )}>
          {record.codigo && <span className="mr-1.5 font-mono text-gray-400">{record.codigo}</span>}
          {record.titulo}
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
