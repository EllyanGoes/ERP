"use client";

import {
  createContext, useContext, useState, useEffect, useCallback, useRef,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { findRoute } from "@/lib/route-registry";
import type { LucideIcon } from "lucide-react";

// ── Route title map ──────────────────────────────────────────────────────────
const ROUTE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/clientes": "Clientes",
  "/clientes/novo": "Novo Cliente",
  "/pedidos-venda": "Pedidos de Venda",
  "/pedidos-venda/novo": "Novo Pedido",
  "/comercial/minutas": "Minutas",
  "/comercial/minutas/nova": "Nova Minuta",
  "/comercial/motoristas": "Motoristas",
  "/itens": "Itens",
  "/itens/novo": "Novo Item",
  "/financeiro/contas": "Contas",
  "/financeiro/bancos": "Bancos",
  "/financeiro/plano-contas": "Plano de Contas",
  "/financeiro/recorrencias": "Recorrências",
  "/financeiro/agenda": "Agenda Financeira",
  "/financeiro/conciliacao": "Conciliação (OFX)",
  "/contas-receber": "Contas a Receber",
  "/contas-receber/nova": "Nova Conta a Receber",
  "/contas-pagar": "Contas a Pagar",
  "/contas-pagar/nova": "Nova Conta a Pagar",
  "/fluxo-caixa": "Fluxo de Caixa",
  "/suprimentos/fornecedores": "Fornecedores",
  "/suprimentos/fornecedores/novo": "Novo Fornecedor",
  "/suprimentos/produtos": "Produtos",
  "/suprimentos/produtos/novo": "Novo Produto",
  "/suprimentos/estoque": "Posição de Estoque",
  "/suprimentos/locais-estoque": "Locais de Estoque",
  "/suprimentos/locais-estoque/novo": "Novo Local",
  "/suprimentos/movimentacoes": "Movimentações",
  "/compras/necessidades": "Solicitações de Compras",
  "/compras/necessidades/nova": "Nova Solicitação",
  "/empresa/filiais": "Filiais",
  "/empresa/centros-custo": "Centros de Custo",
  "/suprimentos/cotacoes": "Cotações",
  "/suprimentos/cotacoes/nova": "Nova Cotação",
  "/suprimentos/pedidos-compra": "Pedidos de Compra",
  "/suprimentos/pedidos-compra/novo": "Novo Pedido de Compra",
  "/suprimentos/conferencias": "Documentos de Entrada",
  "/suprimentos/conferencias/novo": "Novo Documento de Entrada",
  "/suprimentos/tipos-produto": "Tipos de Produto",
  "/suprimentos/unidades": "Unidades de Medida",
  "/suprimentos/relatorios/movimentacoes": "Entradas e Saídas",
  "/suprimentos/relatorios/curva-abc":     "Curva ABC",
  "/suprimentos/relatorios/imd":           "IMD — Demandas",
  "/compras/relatorios/spend":             "SPEND",
  "/compras/relatorios/sla":               "SLA",
  "/compras/relatorios/otd":               "OTD",
  "/suprimentos/condicoes-pagamento": "Cond. de Pagamento",
  "/suprimentos/formas-pagamento": "Formas de Pagamento",
};

function guessTitle(href: string): string {
  // Exact match
  if (ROUTE_TITLES[href]) return ROUTE_TITLES[href];

  // Pattern matches for dynamic routes
  const patterns: Array<[RegExp, string]> = [
    [/^\/clientes\/[^/]+\/editar$/, "Editar Cliente"],
    [/^\/clientes\/[^/]+$/, "Cliente"],
    [/^\/pedidos-venda\/[^/]+$/, "Pedido de Venda"],
    [/^\/itens\/[^/]+\/editar$/, "Editar Item"],
    [/^\/suprimentos\/produtos\/[^/]+$/, "Produto"],
    [/^\/suprimentos\/fornecedores\/[^/]+$/, "Fornecedor"],
    [/^\/compras\/necessidades\/[^/]+$/, "Solicitação"],
    [/^\/comercial\/minutas\/[^/]+$/, "Minuta"],
    [/^\/suprimentos\/cotacoes\/[^/]+$/, "Cotação"],
    [/^\/suprimentos\/pedidos-compra\/[^/]+$/, "Pedido de Compra"],
    [/^\/suprimentos\/conferencias\/[^/]+$/, "Documento de Entrada"],
    [/^\/suprimentos\/locais-estoque\/[^/]+$/, "Local de Estoque"],
    [/^\/contas-receber\/[^/]+$/, "Conta a Receber"],
    [/^\/contas-pagar\/[^/]+$/, "Conta a Pagar"],
  ];
  for (const [regex, title] of patterns) {
    if (regex.test(href)) return title;
  }
  // Fallback: last segment capitalized
  const last = href.split("/").filter(Boolean).pop() ?? "Página";
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, " ");
}

// ── Types ────────────────────────────────────────────────────────────────────
export type Tab = {
  id: string;
  href: string;
  title: string;
  icon?: LucideIcon;
  section?: string;
};

type TabsContextType = {
  tabs: Tab[];
  activeHref: string;
  setTabTitle: (title: string) => void;
  closeTab: (id: string) => void;
  closeCurrentTab: () => void;
  replaceCurrentTab: (href: string) => void;
  closeOthers: () => void;
  reorderTabs: (fromId: string, toId: string, side: "before" | "after") => void;
};

// ── Context ──────────────────────────────────────────────────────────────────
const TabsContext = createContext<TabsContextType>({
  tabs: [],
  activeHref: "/",
  setTabTitle: () => {},
  closeTab: () => {},
  closeCurrentTab: () => {},
  replaceCurrentTab: () => {},
  closeOthers: () => {},
  reorderTabs: () => {},
});

export function useTabsContext() {
  return useContext(TabsContext);
}

// ── Hook — pages call this to set their dynamic title ────────────────────────
export function useTabTitle(title: string | null | undefined) {
  const { setTabTitle } = useTabsContext();
  useEffect(() => {
    if (title) setTabTitle(title);
  }, [title, setTabTitle]);
}

const TABS_STORAGE_KEY = "erp:open-tabs";

type PersistedTab = { id: string; href: string; title: string; section?: string };

function saveTabs(tabs: Tab[]) {
  try {
    const data: PersistedTab[] = tabs.map(({ id, href, title, section }) => ({ id, href, title, section }));
    localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(data));
  } catch { /* quota exceeded or SSR */ }
}

function loadTabs(): Tab[] {
  try {
    const raw = localStorage.getItem(TABS_STORAGE_KEY);
    if (!raw) return [];
    const data: PersistedTab[] = JSON.parse(raw);
    // Strip any query params that might have been saved by a previous broken version
    return data
      .map((t) => ({ ...t, href: t.href.split("?")[0] }))
      .filter((t) => t.href && t.href.startsWith("/"))
      .map((t) => ({ ...t, icon: findRoute(t.href)?.icon }));
  } catch {
    // Clear corrupted data
    try { localStorage.removeItem(TABS_STORAGE_KEY); } catch { /* ignore */ }
    return [];
  }
}

// ── Provider ─────────────────────────────────────────────────────────────────
export function TabsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const idCounterRef = useRef(0);
  const initializedRef = useRef(false);

  // Restore tabs from localStorage on first mount (client only)
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const restored = loadTabs();
    if (restored.length > 0) {
      // Ensure idCounter is beyond any restored ids to avoid collisions
      const maxN = restored.reduce((max, t) => {
        const n = parseInt(t.id.replace("tab-", ""), 10);
        return isNaN(n) ? max : Math.max(max, n);
      }, 0);
      idCounterRef.current = maxN;
      setTabs(restored);
    }
  }, []);

  // Persist tabs whenever they change
  useEffect(() => {
    if (tabs.length > 0) {
      saveTabs(tabs);
    } else if (initializedRef.current) {
      try { localStorage.removeItem(TABS_STORAGE_KEY); } catch { /* ignore */ }
    }
  }, [tabs]);

  // Add or activate tab on route change
  useEffect(() => {
    if (!pathname) return;
    setTabs((prev) => {
      const existing = prev.find((t) => t.href === pathname);
      if (existing) return prev; // already open, just switch
      const id = `tab-${++idCounterRef.current}`;
      const routeEntry = findRoute(pathname);
      const newTab: Tab = {
        id,
        href: pathname,
        title: guessTitle(pathname),
        icon: routeEntry?.icon,
        section: routeEntry?.section,
      };
      return [...prev, newTab];
    });
  }, [pathname]);

  const setTabTitle = useCallback((title: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.href === pathname ? { ...t, title } : t))
    );
  }, [pathname]);

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx === -1) return prev;
      const closing = prev[idx];
      const next = prev.filter((t) => t.id !== id);
      // If closing the active tab, navigate to an adjacent one
      if (closing.href === pathname && next.length > 0) {
        const target = next[Math.min(idx, next.length - 1)];
        router.push(target.href);
      }
      return next;
    });
  }, [pathname, router]);

  const closeCurrentTab = useCallback(() => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.href === pathname);
      if (idx === -1) return prev;
      const next = prev.filter((_, i) => i !== idx);
      if (next.length > 0) {
        const target = next[Math.min(idx, next.length - 1)];
        router.push(target.href);
      }
      return next;
    });
  }, [pathname, router]);

  // Replace the current tab's destination in place (used after creating a record:
  // navigate to the new record without leaving the "Novo …" tab behind).
  const replaceCurrentTab = useCallback((href: string) => {
    const dest = href.split("?")[0];
    if (dest === pathname) return;
    setTabs((prev) => {
      const existingDest = prev.find((t) => t.href === dest);
      // If the destination is already open elsewhere, just drop the current tab.
      if (existingDest) return prev.filter((t) => t.href !== pathname);
      const idx = prev.findIndex((t) => t.href === pathname);
      if (idx === -1) return prev;
      const routeEntry = findRoute(dest);
      const next = [...prev];
      next[idx] = {
        ...prev[idx],
        href: dest,
        title: guessTitle(dest),
        icon: routeEntry?.icon,
        section: routeEntry?.section,
      };
      return next;
    });
    router.push(dest);
  }, [pathname, router]);

  const closeOthers = useCallback(() => {
    setTabs((prev) => prev.filter((t) => t.href === pathname));
  }, [pathname]);

  // Cmd+R (Mac) / Ctrl+R (Windows) → close all other tabs, keep current.
  // Usa a FASE DE CAPTURA para rodar antes de qualquer outro handler e antes do
  // navegador: no Windows o Ctrl+R é o "recarregar página" nativo, então o
  // preventDefault precisa acontecer o mais cedo possível para vencer essa ação.
  // - key.toLowerCase(): cobre Caps Lock / Shift (que mandam "R").
  // - !e.altKey: ignora o AltGr (no Windows AltGr = Ctrl+Alt) p/ não disparar à toa.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        setTabs((prev) => prev.filter((t) => t.href === pathname));
      }
    }
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [pathname]);

  const reorderTabs = useCallback((fromId: string, toId: string, side: "before" | "after") => {
    setTabs((prev) => {
      const fromIdx = prev.findIndex((t) => t.id === fromId);
      const toIdx   = prev.findIndex((t) => t.id === toId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      const newToIdx = next.findIndex((t) => t.id === toId);
      next.splice(side === "before" ? newToIdx : newToIdx + 1, 0, moved);
      return next;
    });
  }, []);

  return (
    <TabsContext.Provider value={{ tabs, activeHref: pathname, setTabTitle, closeTab, closeCurrentTab, replaceCurrentTab, closeOthers, reorderTabs }}>
      {children}
    </TabsContext.Provider>
  );
}
