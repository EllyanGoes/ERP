"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDirtyFormContext } from "@/lib/dirty-form-context";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  Package,
  Warehouse,
  TrendingUp,
  TrendingDown,
  BarChart3,
  FileBarChart2,
  Building2,
  Truck,
  ClipboardList,
  ClipboardCheck,
  PackageSearch,
  ShoppingBag,
  CreditCard,
  Settings,
  Settings2,
  CircleDot,
  FilePlus,
  Tag,
  Ruler,
  MapPin,
  ArrowLeftRight,
  CalendarDays,
  FileSearch,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  GripVertical,
  PieChart,
  UserCog,
  LogOut,
  ShieldCheck,
  HelpCircle,
  User,
  ChevronRight,
  GitBranch,
  UserCheck,
  Plug,
  ThumbsUp,
  Factory,
  Wrench,
  Users2,
  Layers,
  Bell,
  RefreshCw,
  Activity,
  Clock,
  Route,
  Landmark,
  Wallet,
  FolderTree,
  Repeat,
  CalendarClock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSession } from "@/lib/session-context";
import { useShortcuts } from "@/lib/shortcuts-context";
import { routeColor } from "@/lib/route-registry";

// ── Types ─────────────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon?: LucideIcon;
  soon?: boolean;
}

interface SubSection {
  kind: "Cadastros" | "Processos" | "Estoque" | "Fluxo de Compras" | "Almoxarifado" | "Relatórios" | "Sistema" | "Comercial" | "Compras" | "Financeiro" | "Configurações" | "Aprovações" | "Manutenção" | "Geral";
  items: NavItem[];
}

interface Module {
  id: string;
  label: string;
  icon: LucideIcon;
  sections: SubSection[];
}

// ── Data ──────────────────────────────────────────────────────────────────────

const mainModules: Module[] = [
  {
    id: "empresa",
    label: "Empresa",
    icon: Building2,
    sections: [
      {
        kind: "Geral",
        items: [
          { href: "/empresa/filiais",        label: "Filiais",        icon: GitBranch },
          { href: "/empresa/colaboradores",  label: "Colaboradores",  icon: UserCheck },
          { href: "/empresa/setores",        label: "Setores",        icon: Layers },
          { href: "/clientes",               label: "Clientes",       icon: Users },
        ],
      },
      {
        kind: "Almoxarifado",
        items: [
          { href: "/suprimentos/produtos",       label: "Produtos",           icon: Package },
          { href: "/suprimentos/tipos-produto",  label: "Tipos de Produto",   icon: Tag },
          { href: "/suprimentos/unidades",       label: "Unidades de Medida", icon: Ruler },
        ],
      },
      {
        kind: "Compras",
        items: [
          { href: "/suprimentos/fornecedores",        label: "Fornecedores",        icon: Truck },
          { href: "/suprimentos/condicoes-pagamento", label: "Cond. de Pagamento",  icon: CalendarDays },
          { href: "/suprimentos/formas-pagamento",    label: "Formas de Pagamento", icon: CreditCard },
        ],
      },
      {
        kind: "Financeiro",
        items: [
          { href: "/empresa/centros-custo", label: "Centros de Custo", icon: CircleDot },
        ],
      },
    ],
  },
  {
    id: "comercial",
    label: "Comercial",
    icon: ShoppingCart,
    sections: [
      { kind: "Cadastros", items: [
        { href: "/comercial/tabelas-preco",    label: "Tabelas de Preço",    icon: Tag },
        { href: "/comercial/produtos-venda",   label: "Produtos para Venda", icon: Package },
        { href: "/clientes",                   label: "Clientes",            icon: Users },
        { href: "/comercial/motoristas",       label: "Motoristas",          icon: Truck },
      ]},
      { kind: "Processos", items: [
        { href: "/pedidos-venda",          label: "Pedidos de Venda", icon: ShoppingCart },
        { href: "/comercial/saldo-clientes", label: "Saldo por Cliente", icon: PackageSearch },
        { href: "/comercial/minutas",      label: "Minutas",          icon: Truck },
        { href: "/comercial/agenda-entregas", label: "Agenda de Entregas", icon: Route },
        { href: "/comodato",               label: "Comodato",         icon: Package },
      ]},
      { kind: "Relatórios" as SubSection["kind"], items: [
        { href: "/comercial/relatorios/faturamento", label: "Faturamento", icon: BarChart3 },
      ]},
    ],
  },
  {
    id: "almoxarifado",
    label: "Almoxarifado",
    icon: Warehouse,
    sections: [
      {
        kind: "Estoque",
        items: [
          { href: "/suprimentos/locais-estoque",           label: "Locais de Estoque",   icon: MapPin },
          { href: "/suprimentos/estoque",                  label: "Posição de Estoque",  icon: PackageSearch },
          { href: "/suprimentos/movimentacoes",            label: "Movimentações",       icon: ArrowLeftRight },
          { href: "/suprimentos/requisicoes-materiais",    label: "Req/Dev de Materiais", icon: ClipboardList },
          { href: "/suprimentos/inventarios-materiais",    label: "Inventário",          icon: ClipboardCheck },
        ],
      },
      {
        kind: "Relatórios",
        items: [
          { href: "/suprimentos/relatorios/movimentacoes", label: "Entradas e Saídas",    icon: FileBarChart2 },
          { href: "/suprimentos/relatorios/curva-abc",     label: "Curva ABC",           icon: PieChart },
          { href: "/suprimentos/relatorios/imd",           label: "IMD — Demandas",      icon: BarChart3 },
          { href: "/suprimentos/relatorios/consumo",       label: "Análise de Consumo",  icon: Activity },
        ],
      },
    ],
  },
  {
    id: "compras",
    label: "Compras",
    icon: ShoppingBag,
    sections: [
      {
        kind: "Aprovações" as SubSection["kind"],
        items: [
          { href: "/aprovacoes", label: "Minhas Aprovações", icon: ThumbsUp },
        ],
      },
      {
        kind: "Fluxo de Compras",
        items: [
          { href: "/compras/necessidades",       label: "Solicitação de Compras", icon: ClipboardList },
          { href: "/suprimentos/cotacoes",       label: "Cotação de Compras",    icon: FileSearch },
          { href: "/suprimentos/pedidos-compra", label: "Pedido de Compras",     icon: FilePlus },
          { href: "/suprimentos/conferencias",   label: "Doc. Entrada",          icon: PackageCheck },
        ],
      },
      {
        kind: "Relatórios" as SubSection["kind"],
        items: [
          { href: "/compras/relatorios/spend", label: "SPEND", icon: BarChart3 },
          { href: "/compras/relatorios/sla",   label: "SLA",   icon: Clock },
          { href: "/compras/relatorios/otd",   label: "OTD",   icon: Truck },
        ],
      },
    ],
  },
  {
    id: "financeiro",
    label: "Financeiro",
    icon: BarChart3,
    sections: [
      {
        kind: "Cadastros",
        items: [
          { href: "/financeiro/contas",       label: "Contas Bancárias", icon: Wallet },
          { href: "/financeiro/bancos",       label: "Bancos",           icon: Landmark },
          { href: "/financeiro/plano-contas", label: "Plano de Contas",  icon: FolderTree },
        ],
      },
      {
        kind: "Processos",
        items: [
          { href: "/contas-receber",       label: "Contas a Receber",  icon: TrendingUp },
          { href: "/contas-pagar",         label: "Contas a Pagar",    icon: TrendingDown },
          { href: "/financeiro/agenda",    label: "Agenda Financeira", icon: CalendarClock },
          { href: "/financeiro/recorrencias", label: "Recorrências",   icon: Repeat },
          { href: "/fluxo-caixa",          label: "Fluxo de Caixa",    icon: BarChart3 },
        ],
      },
    ],
  },
  {
    id: "pcm",
    label: "PCM",
    icon: Wrench,
    sections: [
      {
        kind: "Manutenção" as SubSection["kind"],
        items: [
          { href: "/pcm/dashboard",       label: "Resultados",       icon: BarChart3 },
          { href: "/pcm/ordens",          label: "Relatório de O.S.", icon: ClipboardList },
          { href: "/pcm/relatorio-mtbf",  label: "Relatório MTBF",   icon: Activity },
        ],
      },
    ],
  },
];

const adminModule: Module = {
  id: "admin",
  label: "Administração",
  icon: ShieldCheck,
  sections: [
    {
      kind: "Sistema",
      items: [
        { href: "/admin/usuarios", label: "Usuários",          icon: UserCog },
        { href: "/admin/perfis",   label: "Perfis de Acesso",  icon: ShieldCheck },
      ],
    },
  ],
};

const configModule: Module = {
  id: "configuracoes",
  label: "Configurações",
  icon: Settings2,
  sections: [
    {
      kind: "Configurações",
      items: [
        { href: "/configuracoes/aprovacoes",   label: "Aprovações",   icon: Settings2 },
        { href: "/configuracoes/integracoes",  label: "Integrações",  icon: Plug },
      ],
    },
  ],
};

const allModules = [...mainModules, adminModule, configModule];

// ── Future modules (strip-only, no panel, disabled) ───────────────────────────
const futureModules: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "pcp",             label: "PCP — Planejamento e Controle de Produção",  icon: Factory },
  { id: "gestao-pessoas",  label: "Gestão de Pessoas",                           icon: Users2  },
];

const STRIP_W       = 64;
const PANEL_MIN       = 160;
const PANEL_MAX       = 400;
const PANEL_DEFAULT   = 220;
const PANEL_COLLAPSE  = 100; // abaixo disso, fecha o painel completamente

function moduleIsActive(mod: Module, pathname: string) {
  return mod.sections.some((s) =>
    s.items.some((item) => !item.soon && pathname.startsWith(item.href))
  );
}

function itemIsActive(item: NavItem, pathname: string) {
  if (item.soon) return false;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

const kindStyle: Record<SubSection["kind"], string> = {
  Cadastros:          "text-violet-500",
  Processos:          "text-blue-500",
  Estoque:            "text-emerald-500",
  "Fluxo de Compras": "text-amber-500",
  Almoxarifado:       "text-emerald-500",
  Relatórios:         "text-rose-500",
  Sistema:            "text-gray-400",
  Comercial:          "text-blue-500",
  Geral:              "text-blue-500",
  Compras:            "text-amber-500",
  Financeiro:         "text-emerald-600",
  Configurações:      "text-purple-500",
  "Aprovações":       "text-emerald-600",
  "Manutenção":       "text-orange-500",
};

// ── Tooltip wrapper (portal-based) ────────────────────────────────────────────

function StripTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const ref      = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos]         = useState({ top: 0, left: 0 });
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  function handleEnter() {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({ top: r.top + r.height / 2, left: r.right + 8 });
    }
    timerRef.current = setTimeout(() => setVisible(true), 300);
  }

  function handleLeave() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }

  return (
    <div ref={ref} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {children}
      {mounted && visible && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ top: pos.top, left: pos.left, transform: "translateY(-50%)" }}
        >
          <div className="bg-white text-gray-800 text-xs font-medium px-3 py-1.5 rounded-lg whitespace-nowrap shadow-[0_4px_16px_rgba(0,0,0,0.10)] border border-gray-100">
            {label}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── User Dropdown (portal-based) ──────────────────────────────────────────────

function UserDropdown({
  user,
  userInitials,
  onLogout,
}: {
  user: { nome: string; email: string; perfil: string } | null;
  userInitials: string;
  onLogout: () => void;
}) {
  const btnRef   = useRef<HTMLButtonElement>(null);
  const dropRef  = useRef<HTMLDivElement>(null);
  const [open, setOpen]     = useState(false);
  const [pos, setPos]       = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  const { attemptNavigate } = useDirtyFormContext();
  const router = useRouter();

  useEffect(() => { setMounted(true); }, []);

  function handleToggle() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom - 220, left: r.right + 8 }); // anchor near bottom
    setOpen((p) => !p);
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const isAdmin = user?.perfil === "ADMIN";

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleToggle}
        title={user ? `${user.nome} · ${user.email}` : "Usuário"}
        className={cn(
          "flex items-center justify-center w-9 h-9 rounded-xl transition-colors",
          open ? "bg-gray-700" : "hover:bg-gray-800"
        )}
      >
        <div className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold select-none",
          isAdmin ? "bg-blue-500 text-white" : "bg-gray-600 text-gray-200"
        )}>
          {userInitials}
        </div>
      </button>

      {mounted && open && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[9999] w-56 rounded-xl bg-white border border-gray-200 shadow-[0_8px_32px_rgba(0,0,0,0.14)] overflow-hidden"
          style={{ top: pos.top, left: pos.left }}
        >
          {/* User info */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
            <div className={cn(
              "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
              isAdmin ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
            )}>
              {userInitials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{user?.nome ?? "—"}</p>
              <p className="text-xs text-gray-400 truncate">{user?.email ?? "—"}</p>
              {isAdmin && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-blue-600 mt-0.5">
                  <ShieldCheck className="w-3 h-3" /> Admin
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="py-1">
            <button
              onClick={() => { setOpen(false); attemptNavigate(() => router.push("/minha-conta")); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <User className="w-4 h-4 text-gray-400" />
              Minha Conta
              <ChevronRight className="w-3.5 h-3.5 text-gray-300 ml-auto" />
            </button>
          </div>

          <div className="border-t border-gray-100 py-1">
            <button
              onClick={() => { setOpen(false); onLogout(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { attemptNavigate } = useDirtyFormContext();
  const { user, canAccess } = useSession();
  const { openShortcuts } = useShortcuts();

  // ── Pending approvals badge + notification panel ─────────────────────────
  const [pendingAprov, setPendingAprov] = useState(0);
  const [notifOpen, setNotifOpen]       = useState(false);
  const notifBtnRef = useRef<HTMLButtonElement>(null);
  const notifPanelRef = useRef<HTMLDivElement>(null);
  const [notifPos, setNotifPos] = useState({ top: 0, left: 0 });
  const [notifMounted, setNotifMounted] = useState(false);
  useEffect(() => { setNotifMounted(true); }, []);

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch("/api/aprovacoes?status=PENDENTE&limit=1");
      if (res.ok) {
        const d = await res.json();
        setPendingAprov(d.pendingCount ?? 0);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchPending();
    const timer = setInterval(fetchPending, 60_000); // poll every 60s
    return () => clearInterval(timer);
  }, [fetchPending]);

  // Close notification panel on outside click
  useEffect(() => {
    if (!notifOpen) return;
    function onDown(e: MouseEvent) {
      if (
        notifPanelRef.current && !notifPanelRef.current.contains(e.target as Node) &&
        notifBtnRef.current   && !notifBtnRef.current.contains(e.target as Node)
      ) setNotifOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [notifOpen]);

  function handleNotifToggle() {
    if (!notifBtnRef.current) return;
    const r = notifBtnRef.current.getBoundingClientRect();
    setNotifPos({ top: r.top, left: r.right + 8 });
    setNotifOpen((p) => {
      if (!p) fetchPending(); // refetch ao abrir para evitar estado stale
      return !p;
    });
  }

  // Visible main modules (exclude admin)
  const visibleMain  = mainModules.filter((mod) => canAccess(mod.id));
  const showAdmin    = canAccess("admin");

  // All visible for active detection
  const visibleAll = showAdmin ? [...visibleMain, adminModule] : visibleMain;

  const [openId, setOpenId] = useState<string | null>(() => {
    const active = allModules.find((m) => moduleIsActive(m, pathname));
    return active?.id ?? null;
  });

  const [panelWidth, setPanelWidth] = useState<number>(() => {
    if (typeof window === "undefined") return PANEL_DEFAULT;
    return parseInt(localStorage.getItem("sidebar-panel-w") ?? "") || PANEL_DEFAULT;
  });

  const [stripCollapsed, setStripCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar-collapsed") === "1";
  });
  const [modKey, setModKey] = useState("⌘");

  useEffect(() => {
    if (!/Mac|iPhone|iPad|iPod/.test(navigator.platform)) setModKey("Ctrl");
  }, []);

  const draggingRef = useRef(false);
  const dragStartX  = useRef(0);
  const dragStartW  = useRef(0);

  // Note: no auto-open on pathname change — user controls which module panel is open.
  // Initial open state is set by useState initializer above.

  // Sync CSS variable + data attribute (used by pages to react to sidebar state)
  useLayoutEffect(() => {
    const w = stripCollapsed ? 0 : STRIP_W + (openId ? panelWidth : 0);
    document.documentElement.style.setProperty("--sidebar-width", `${w}px`);
    // "1" = panel open (sidebar expanded), "0" = strip-only or fully collapsed
    document.documentElement.dataset.sidebarExpanded = (!stripCollapsed && !!openId) ? "1" : "0";
  }, [openId, panelWidth, stripCollapsed]);

  // Persist settings
  useEffect(() => { localStorage.setItem("sidebar-panel-w", String(panelWidth)); }, [panelWidth]);
  useEffect(() => { localStorage.setItem("sidebar-collapsed", stripCollapsed ? "1" : "0"); }, [stripCollapsed]);

  // ⌘B shortcut
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setStripCollapsed((p) => !p);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Resize drag
  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    dragStartX.current  = e.clientX;
    dragStartW.current  = panelWidth;

    function onMove(ev: MouseEvent) {
      if (!draggingRef.current) return;
      const delta = ev.clientX - dragStartX.current;
      const raw   = dragStartW.current + delta;
      // Se arrastou além do threshold de colapso, fecha o painel
      if (raw < PANEL_COLLAPSE) {
        draggingRef.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        setOpenId(null);
        return;
      }
      const next = Math.min(PANEL_MAX, Math.max(PANEL_MIN, raw));
      setPanelWidth(next);
    }
    function onUp() {
      draggingRef.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [panelWidth]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const openModule = allModules.find((m) => m.id === openId) ?? null;
  const sidebarW   = stripCollapsed ? 0 : STRIP_W + (openId ? panelWidth : 0);

  const userInitials = user?.nome
    ? user.nome.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  return (
    <>
      {/* ── Floating reopen button when fully collapsed ──────────────── */}
      {stripCollapsed && (
        <div className="fixed left-0 top-0 h-screen w-6 z-40 group/reopen">
          <button
            onClick={() => setStripCollapsed(false)}
            title={`Expandir sidebar (${modKey}B)`}
            className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center justify-center
              w-5 h-10 bg-gray-200 hover:bg-gray-300 text-gray-500 hover:text-gray-700
              rounded-r-lg transition-all shadow-md
              opacity-0 group-hover/reopen:opacity-100 -translate-x-full group-hover/reopen:translate-x-0
              duration-150"
          >
            <PanelLeftOpen className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <aside
        className="fixed left-0 top-0 h-screen z-30 flex overflow-hidden transition-[width] duration-200"
        style={{ width: sidebarW }}
      >
        {/* ── Icon strip ─────────────────────────────────────────────── */}
        <div
          className="flex flex-col bg-gray-900 shrink-0 overflow-hidden"
          style={{ width: STRIP_W, minWidth: STRIP_W }}
        >
          {/* Logo */}
          <div className="flex items-center justify-center h-16 border-b border-gray-800 shrink-0">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
          </div>

          {/* Dashboard */}
          <div className="flex flex-col items-center pt-3 pb-1 gap-1">
            <StripTooltip label="Dashboard">
              <button
                onClick={() => attemptNavigate(() => router.push("/dashboard"))}
                className={cn(
                  "flex flex-col items-center justify-center w-9 h-9 rounded-xl transition-colors",
                  pathname === "/dashboard"
                    ? "bg-blue-500 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                )}
              >
                <LayoutDashboard className="w-4 h-4" />
              </button>
            </StripTooltip>
          </div>

          <div className="mx-4 border-t border-gray-800 my-2" />

          {/* Main module icons */}
          <nav className="flex flex-col items-center gap-1 px-2 flex-1 overflow-y-auto scrollbar-none" style={{ scrollbarWidth: "none" }}>
            {visibleMain.map((mod) => {
              const isOpen   = openId === mod.id;
              const isActive = moduleIsActive(mod, pathname);
              return (
                <StripTooltip key={mod.id} label={mod.label}>
                  <button
                    onClick={() => setOpenId(isOpen ? null : mod.id)}
                    className={cn(
                      "relative flex flex-col items-center justify-center w-9 h-9 rounded-xl transition-colors",
                      isOpen
                        ? "bg-gray-700 text-white"
                        : isActive
                        ? "text-blue-400 hover:bg-gray-800"
                        : "text-gray-500 hover:bg-gray-800 hover:text-gray-200"
                    )}
                  >
                    <mod.icon className="w-4 h-4" />
                    {isActive && !isOpen && (
                      <span className="absolute right-1.5 top-1.5 w-1.5 h-1.5 bg-blue-400 rounded-full" />
                    )}
                  </button>
                </StripTooltip>
              );
            })}

            {/* Divider before future modules */}
            <div className="w-6 border-t border-gray-700 my-1.5" />

            {/* Future modules — disabled with "breve" indicator */}
            {futureModules.map((mod) => (
              <StripTooltip key={mod.id} label={`${mod.label} — Em breve`}>
                <div className="relative flex flex-col items-center justify-center w-9 h-9 rounded-xl cursor-not-allowed opacity-40">
                  <mod.icon className="w-4 h-4 text-gray-400" />
                  {/* tiny "soon" dot */}
                  <span className="absolute right-1 top-1 w-1.5 h-1.5 bg-amber-400 rounded-full" />
                </div>
              </StripTooltip>
            ))}
          </nav>

          {/* ── Bottom area (de cima para baixo: recolher → admin → suporte → config → perfil) ── */}
          <div className="flex flex-col items-center gap-1 pb-3 pt-2 border-t border-gray-800 mt-2">

            {/* Recolher sidebar */}
            <StripTooltip label={`Recolher sidebar (${modKey}B)`}>
              <button
                onClick={() => setStripCollapsed(true)}
                className="flex items-center justify-center w-9 h-9 rounded-xl
                  text-gray-500 hover:bg-gray-800 hover:text-gray-200 transition-colors"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </StripTooltip>

            {/* Notificações */}
            <StripTooltip label={pendingAprov > 0 ? `Notificações (${pendingAprov} pendentes)` : "Notificações"}>
              <button
                ref={notifBtnRef}
                onClick={handleNotifToggle}
                className={cn(
                  "relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors",
                  notifOpen
                    ? "bg-gray-700 text-white"
                    : pendingAprov > 0
                    ? "text-amber-400 hover:bg-gray-800"
                    : "text-gray-500 hover:bg-gray-800 hover:text-gray-200"
                )}
              >
                <Bell className="w-4 h-4" />
                {pendingAprov > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                    {pendingAprov > 99 ? "99+" : pendingAprov}
                  </span>
                )}
              </button>
            </StripTooltip>

            {/* Administração — só para quem tem acesso */}
            {showAdmin && (
              <StripTooltip label="Administração">
                <button
                  onClick={() => setOpenId(openId === "admin" ? null : "admin")}
                  className={cn(
                    "relative flex flex-col items-center justify-center w-9 h-9 rounded-xl transition-colors",
                    openId === "admin"
                      ? "bg-gray-700 text-white"
                      : moduleIsActive(adminModule, pathname)
                      ? "text-blue-400 hover:bg-gray-800"
                      : "text-gray-500 hover:bg-gray-800 hover:text-gray-200"
                  )}
                >
                  <ShieldCheck className="w-4 h-4" />
                  {moduleIsActive(adminModule, pathname) && openId !== "admin" && (
                    <span className="absolute right-1.5 top-1.5 w-1.5 h-1.5 bg-blue-400 rounded-full" />
                  )}
                </button>
              </StripTooltip>
            )}

            {/* Atalhos / Ajuda */}
            <StripTooltip label="Atalhos do teclado (?)">
              <button
                onClick={openShortcuts}
                className="flex items-center justify-center w-9 h-9 rounded-xl
                  text-gray-500 hover:bg-gray-800 hover:text-gray-200 transition-colors"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            </StripTooltip>

            {/* Configurações */}
            <StripTooltip label="Configurações">
              <button
                onClick={() => setOpenId(openId === "configuracoes" ? null : "configuracoes")}
                className={cn(
                  "relative flex flex-col items-center justify-center w-9 h-9 rounded-xl transition-colors",
                  openId === "configuracoes"
                    ? "bg-gray-700 text-white"
                    : moduleIsActive(configModule, pathname)
                    ? "text-blue-400 hover:bg-gray-800"
                    : "text-gray-500 hover:bg-gray-800 hover:text-gray-200"
                )}
              >
                <Settings className="w-4 h-4" />
                {moduleIsActive(configModule, pathname) && openId !== "configuracoes" && (
                  <span className="absolute right-1.5 top-1.5 w-1.5 h-1.5 bg-blue-400 rounded-full" />
                )}
              </button>
            </StripTooltip>

            {/* Perfil (dropdown do usuário) */}
            <UserDropdown user={user} userInitials={userInitials} onLogout={handleLogout} />
          </div>
        </div>

        {/* ── Flyout panel ───────────────────────────────────────────── */}
        {openId && (
          <div
            className="h-full bg-white border-r border-gray-200 flex flex-col overflow-hidden relative"
            style={{ width: panelWidth }}
          >
            {openModule && (
              <>
                {/* Panel header */}
                <div className="flex items-center gap-2.5 px-4 h-16 border-b border-gray-100 shrink-0">
                  <openModule.icon className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className="font-semibold text-gray-900 text-sm">{openModule.label}</span>
                </div>

                {/* Nav sections */}
                <nav className="flex-1 overflow-y-auto py-3 px-3">
                  {openModule.sections.map((section) => (
                    <div key={section.kind} className="mb-4">
                      <p className={cn("text-[10px] font-bold uppercase tracking-widest px-2 mb-1", kindStyle[section.kind])}>
                        {section.kind}
                      </p>
                      {section.items.map((item) => {
                        const active = itemIsActive(item, pathname);
                        const Icon   = item.icon ?? CircleDot;
                        const color  = routeColor(section.kind);
                        if (item.soon) {
                          return (
                            <div
                              key={item.href}
                              className="flex items-center gap-2 px-2 py-1.5 text-xs text-gray-300 cursor-not-allowed"
                              title="Em breve"
                            >
                              <span className="flex shrink-0 items-center justify-center w-5 h-5 rounded-md bg-gray-100">
                                <Icon className="w-3 h-3 text-gray-200" />
                              </span>
                              <span className="flex-1 truncate">{item.label}</span>
                              <span className="text-[9px] font-semibold bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">breve</span>
                            </div>
                          );
                        }
                        return (
                          <button
                            key={item.href}
                            onClick={() => attemptNavigate(() => router.push(item.href))}
                            className={cn(
                              "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors",
                              active
                                ? "bg-blue-50 text-blue-700 font-medium"
                                : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                            )}
                          >
                            <span className={cn(
                              "flex shrink-0 items-center justify-center w-5 h-5 rounded-md transition-colors",
                              active ? `${color.selBg} ${color.selText}` : `${color.bg} ${color.text}`
                            )}>
                              <Icon className="w-3 h-3" />
                            </span>
                            <span className="truncate flex-1 text-left">{item.label}</span>
                            {item.href === "/aprovacoes" && pendingAprov > 0 && (
                              <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                                {pendingAprov > 99 ? "99+" : pendingAprov}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </nav>

                {/* User info footer in panel */}
                {user && (
                  <div className="border-t border-gray-100 p-3 space-y-1 shrink-0">
                    <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
                      <div className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                        user.perfil === "ADMIN" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
                      )}>
                        {userInitials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate">{user.nome}</p>
                        <p className="text-xs text-gray-400 truncate">{user.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sair
                    </button>
                  </div>
                )}
              </>
            )}

            {/* ── Resize handle ───────────────────────────────────────── */}
            <div
              onMouseDown={onResizeMouseDown}
              className="group absolute right-0 top-0 h-full w-3 cursor-col-resize flex items-center justify-center z-10"
              title={`Arraste para redimensionar · ${modKey}B para recolher`}
            >
              <div className="w-0.5 h-8 rounded-full bg-gray-200 group-hover:bg-blue-400 transition-colors" />
              <GripVertical className="absolute w-3 h-3 text-gray-300 group-hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100" />
            </div>
          </div>
        )}
      </aside>

      {/* ── Notification panel (portal) ─────────────────────────────────────── */}
      {notifMounted && notifOpen && createPortal(
        <div
          ref={notifPanelRef}
          className="fixed z-[9999] w-72 rounded-xl bg-white border border-gray-200 shadow-[0_8px_32px_rgba(0,0,0,0.14)] overflow-hidden"
          style={{ top: notifPos.top, left: notifPos.left }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-semibold text-gray-800">Notificações</span>
              {pendingAprov > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                  {pendingAprov > 99 ? "99+" : pendingAprov}
                </span>
              )}
            </div>
            <button
              onClick={fetchPending}
              title="Atualizar"
              className="text-gray-400 hover:text-gray-600 transition-colors p-0.5 rounded"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Body */}
          <div className="max-h-72 overflow-y-auto">
            {pendingAprov > 0 ? (
              <button
                onClick={() => { setNotifOpen(false); attemptNavigate(() => router.push("/aprovacoes")); }}
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-amber-50 transition-colors text-left border-b border-gray-50"
              >
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                  <ThumbsUp className="w-4 h-4 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">
                    {pendingAprov === 1
                      ? "1 aprovação aguardando"
                      : `${pendingAprov} aprovações aguardando`}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Solicitações de compra pendentes de aprovação
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-1" />
              </button>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-center px-4">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                  <Bell className="w-5 h-5 text-gray-300" />
                </div>
                <p className="text-sm text-gray-400">Nenhuma notificação pendente</p>
              </div>
            )}
          </div>

          {/* Footer */}
          {pendingAprov > 0 && (
            <div className="border-t border-gray-100 px-4 py-2.5">
              <button
                onClick={() => { setNotifOpen(false); attemptNavigate(() => router.push("/aprovacoes")); }}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium w-full text-center"
              >
                Ver todas as aprovações
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
