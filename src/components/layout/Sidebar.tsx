"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useDirtyFormContext } from "@/lib/dirty-form-context";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  UserRound,
  ShoppingCart,
  Package,
  Warehouse,
  TrendingUp,
  TrendingDown,
  BarChart3,
  FileBarChart2,
  FileText,
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
  Workflow,
  Boxes,
  FlaskConical,
  Calculator,
  BookOpen,
  Wrench,
  Users2,
  Layers,
  Activity,
  Clock,
  Route,
  Landmark,
  Wallet,
  FolderTree,
  Repeat,
  CalendarClock,
  FileCheck2,
  Monitor,
  Megaphone,
  Target,
  Map as MapIcon,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSession } from "@/lib/session-context";
import { useShortcuts } from "@/lib/shortcuts-context";
import { routeColor } from "@/lib/route-registry";
import ThemeToggle from "@/components/shared/ThemeToggle";

// ── Types ─────────────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon?: LucideIcon;
  soon?: boolean;
  /** Quando true, só fica ativo na rota exata (não em sub-rotas). Usado quando
   *  o href é prefixo de outros itens do menu (ex.: /marketing). */
  exact?: boolean;
}

interface SubSection {
  kind: "Cadastros" | "Processos" | "Estoque" | "Fluxo de Compras" | "Almoxarifado" | "Relatórios" | "Sistema" | "Comercial" | "Compras" | "Financeiro" | "Configurações" | "Aprovações" | "Manutenção" | "Geral" | "Produção" | "Estrutura" | "Planejamento/Apontamento" | "Outros" | "Inteligência Comercial";
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
        kind: "Estoque",
        items: [
          { href: "/suprimentos/produtos",       label: "Produtos",           icon: Package },
          { href: "/suprimentos/unidades",       label: "Unidades de Medida", icon: Ruler },
        ],
      },
      {
        kind: "Compras",
        items: [
          { href: "/suprimentos/fornecedores",        label: "Fornecedores",        icon: Truck },
          { href: "/suprimentos/condicoes-pagamento", label: "Cond. de Pagamento",  icon: CalendarDays },
          { href: "/suprimentos/tipos-operacao",      label: "Tipos de Op. (TES)",  icon: ArrowLeftRight },
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
    id: "marketing",
    label: "Marketing",
    icon: Megaphone,
    sections: [
      {
        kind: "Geral",
        items: [
          { href: "/marketing", label: "Painel de Marketing", icon: Megaphone, exact: true },
        ],
      },
      {
        kind: "Inteligência Comercial" as SubSection["kind"],
        items: [
          { href: "/marketing/inteligencia-comercial",                 label: "Concorrentes",     icon: Target, exact: true },
          { href: "/marketing/inteligencia-comercial/relatorio-precos", label: "Preço de Mercado", icon: BarChart3 },
          { href: "/marketing/inteligencia-comercial/mapa",            label: "Geomarketing",     icon: MapIcon },
        ],
      },
    ],
  },
  {
    id: "comercial",
    label: "Faturamento",
    icon: ShoppingCart,
    sections: [
      { kind: "Cadastros", items: [
        { href: "/comercial/tabelas-preco",    label: "Tabelas de Preço",    icon: Tag },
        { href: "/comercial/produtos-venda",   label: "Produtos para Venda", icon: Package },
        { href: "/clientes",                   label: "Clientes",            icon: Users },
        { href: "/comercial/vendedores",       label: "Vendedores",          icon: UserRound },
        { href: "/comercial/motoristas",       label: "Motoristas",          icon: Truck },
      ]},
      { kind: "Processos", items: [
        { href: "/pedidos-venda",          label: "Pedidos de Venda", icon: ShoppingCart },
        { href: "/pdv",                    label: "Caixa",            icon: Monitor },
        { href: "/comercial/saldo-clientes", label: "Saldos", icon: PackageSearch },
        { href: "/comercial/minutas",      label: "Minutas",          icon: Truck },
        { href: "/comercial/agenda-entregas", label: "Agenda de Entregas", icon: Route },
        { href: "/comodato",               label: "Comodato",         icon: Package },
      ]},
      { kind: "Relatórios" as SubSection["kind"], items: [
        { href: "/comercial/relatorios/faturamento", label: "Faturamento", icon: BarChart3 },
        { href: "/comercial/relatorios/faturamento-diario", label: "Resumo Diário", icon: FileText },
        { href: "/comercial/relatorios/materiais", label: "Materiais Vendidos", icon: Package },
      ]},
    ],
  },
  {
    id: "almoxarifado",
    label: "Estoque",
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
          { href: "/suprimentos/estoque-terceiros",        label: "Estoque de Terceiros", icon: PackageSearch },
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
          { href: "/financeiro/contas",       label: "Contas",           icon: Wallet },
          { href: "/financeiro/bancos",       label: "Bancos",           icon: Landmark },
          { href: "/financeiro/cartoes",      label: "Cartões",          icon: CreditCard },
          { href: "/financeiro/naturezas",    label: "Naturezas Financeiras", icon: ArrowLeftRight },
        ],
      },
      {
        kind: "Processos",
        items: [
          { href: "/contas-receber",       label: "Contas a Receber",  icon: TrendingUp },
          { href: "/contas-pagar",         label: "Contas a Pagar",    icon: TrendingDown },
          { href: "/financeiro/encontro-de-contas", label: "Compensação Pagar/Receber", icon: ArrowLeftRight },
          { href: "/financeiro/agenda",    label: "Agenda Financeira", icon: CalendarClock },
          { href: "/financeiro/recorrencias", label: "Recorrências",   icon: Repeat },
          { href: "/financeiro/conciliacao", label: "Conciliação (OFX)", icon: FileCheck2 },
        ],
      },
      {
        kind: "Relatórios",
        items: [
          { href: "/fluxo-caixa", label: "Fluxo de Caixa", icon: BarChart3 },
        ],
      },
    ],
  },
  {
    id: "contabilidade",
    label: "Contabilidade",
    icon: Calculator,
    sections: [
      {
        kind: "Cadastros",
        items: [
          { href: "/contabilidade/plano-contas", label: "Plano de Contas", icon: FolderTree },
          { href: "/contabilidade/imobilizado", label: "Imobilizado", icon: Calculator },
        ],
      },
      {
        kind: "Processos",
        items: [
          { href: "/contabilidade/lancamentos", label: "Diário Contábil", icon: BarChart3 },
          { href: "/contabilidade/cpv", label: "CPV", icon: Calculator },
          { href: "/contabilidade/fechamento", label: "Encerramento do Exercício", icon: CalendarClock },
        ],
      },
      {
        kind: "Relatórios",
        items: [
          { href: "/contabilidade/razao", label: "Razão", icon: FolderTree },
          { href: "/contabilidade/balancete", label: "Balancete", icon: Calculator },
          { href: "/contabilidade/dre", label: "DRE", icon: BarChart3 },
          { href: "/contabilidade/balanco", label: "Balanço Patrimonial", icon: Calculator },
          { href: "/contabilidade/diagnostico", label: "Diagnóstico", icon: Activity },
        ],
      },
    ],
  },
  {
    id: "rh",
    label: "Gestão de Pessoas",
    icon: Users2,
    sections: [
      {
        kind: "Cadastros",
        items: [
          { href: "/empresa/colaboradores", label: "Colaboradores", icon: UserCog },
        ],
      },
      {
        kind: "Processos",
        items: [
          { href: "/rh/folhas", label: "Folhas de Pagamento", icon: FileText },
          { href: "/rh/diaristas", label: "Lançamento de Diárias", icon: CalendarDays },
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
          { href: "/pcm/ativos",          label: "Ativos",           icon: Factory },
          { href: "/pcm/ordens",          label: "Relatório de O.S.", icon: ClipboardList },
          { href: "/pcm/quadro-os",       label: "Quadro de O.S.",   icon: ClipboardList },
          { href: "/pcm/planos",          label: "Planos de Manut.", icon: CalendarClock },
        ],
      },
      {
        kind: "Ativo Saúde" as SubSection["kind"],
        items: [
          { href: "/pcm/ativo-saude",            label: "MTBF / MTTR",       icon: Activity },
          { href: "/pcm/ativo-saude/fechamento", label: "Fechamento mensal", icon: ClipboardCheck },
          { href: "/pcm/ativo-saude/configuracao", label: "Tipos de OS",     icon: Settings2 },
        ],
      },
    ],
  },
  {
    id: "pcp",
    label: "PCP",
    icon: Factory,
    sections: [
      {
        kind: "Estrutura" as SubSection["kind"],
        items: [
          { href: "/pcp/centros-trabalho", label: "Centros de Trabalho",  icon: Boxes },
          { href: "/pcp/estados-wip",      label: "Estados de WIP",       icon: Layers },
          { href: "/pcp/fluxos",           label: "Fluxos de Produção",   icon: Workflow },
          { href: "/pcp/engenharia",       label: "Engenharia do Produto", icon: FlaskConical },
          { href: "/pcp/cargas-movimentacao", label: "Cargas de Movimentação", icon: Truck },
        ],
      },
      {
        kind: "Planejamento/Apontamento" as SubSection["kind"],
        items: [
          { href: "/pcp/ordens",           label: "Ordens de Produção",   icon: ClipboardList },
        ],
      },
      {
        kind: "Outros" as SubSection["kind"],
        items: [
          { href: "/pcp/planejamento",     label: "Planejamento (MPS/MRP)", icon: Calculator },
          { href: "/pcp/dashboard",        label: "Dashboard",            icon: BarChart3 },
          { href: "/pcp/ajuda",            label: "Como usar",            icon: BookOpen },
        ],
      },
    ],
  },
];

// Administração vive dentro de Configurações: a seção "Sistema" (admin) só é
// renderizada para quem tem acesso ao módulo admin (filtro no render).
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
    {
      kind: "Sistema",
      items: [
        { href: "/admin/usuarios",    label: "Usuários",             icon: UserCog },
        { href: "/admin/perfis",      label: "Perfis de Acesso",     icon: ShieldCheck },
        { href: "/admin/empresas",    label: "Empresas do Grupo",    icon: Building2 },
        { href: "/admin/consolidado", label: "Consolidado do Grupo", icon: Building2 },
        { href: "/admin/lixeira",     label: "Lixeira",              icon: Trash2 },
      ],
    },
  ],
};

const allModules = [...mainModules, configModule];

// ── Future modules (strip-only, no panel, disabled) ───────────────────────────
const futureModules: { id: string; label: string; icon: LucideIcon }[] = [];

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
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

const kindStyle: Record<SubSection["kind"], string> = {
  Cadastros:          "text-violet-500 dark:text-violet-400",
  Processos:          "text-blue-500 dark:text-blue-400",
  Estoque:            "text-emerald-500 dark:text-emerald-400",
  "Fluxo de Compras": "text-amber-500 dark:text-amber-400",
  Almoxarifado:       "text-emerald-500 dark:text-emerald-400",
  Relatórios:         "text-rose-500 dark:text-rose-400",
  Sistema:            "text-gray-400 dark:text-muted-foreground",
  Comercial:          "text-blue-500 dark:text-blue-400",
  Geral:              "text-blue-500 dark:text-blue-400",
  Compras:            "text-amber-500 dark:text-amber-400",
  Financeiro:         "text-emerald-600 dark:text-emerald-400",
  Configurações:      "text-purple-500 dark:text-purple-400",
  "Aprovações":       "text-emerald-600 dark:text-emerald-400",
  "Manutenção":       "text-orange-500 dark:text-orange-400",
  "Produção":         "text-cyan-500 dark:text-cyan-400",
  "Estrutura":        "text-indigo-500 dark:text-indigo-400",
  "Planejamento/Apontamento":     "text-cyan-500 dark:text-cyan-400",
  "Outros":           "text-gray-400 dark:text-muted-foreground",
  "Inteligência Comercial": "text-fuchsia-500 dark:text-fuchsia-400",
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
          <div className="bg-popover text-popover-foreground text-xs font-medium px-3 py-1.5 rounded-lg whitespace-nowrap shadow-[0_4px_16px_rgba(0,0,0,0.10)] border border-border">
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
          className="fixed z-[9999] w-56 rounded-xl bg-popover text-popover-foreground border border-border shadow-[0_8px_32px_rgba(0,0,0,0.14)] overflow-hidden"
          style={{ top: pos.top, left: pos.left }}
        >
          {/* User info */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <div className={cn(
              "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
              isAdmin ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
            )}>
              {userInitials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{user?.nome ?? "—"}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email ?? "—"}</p>
              {isAdmin && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary mt-0.5">
                  <ShieldCheck className="w-3 h-3" /> Admin
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="py-1">
            <button
              onClick={() => { setOpen(false); attemptNavigate(() => router.push("/minha-conta")); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
            >
              <User className="w-4 h-4 text-muted-foreground" />
              Minha Conta
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 ml-auto" />
            </button>
            <button
              onClick={() => { setOpen(false); attemptNavigate(() => router.push("/conta/dispositivos")); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
            >
              <Monitor className="w-4 h-4 text-muted-foreground" />
              Dispositivos
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 ml-auto" />
            </button>
          </div>

          <div className="border-t border-border py-1">
            <button
              onClick={() => { setOpen(false); onLogout(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors"
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

  // ── Badge de aprovações pendentes (alimenta o item "Minhas Aprovações") ──
  // O sino/painel de notificações migrou p/ o topo (NotificationCenter no TabBar).
  const [pendingAprov, setPendingAprov] = useState(0);

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

  // Visible main modules (exclude admin)
  const visibleMain  = mainModules.filter((mod) => canAccess(mod.id));
  const showAdmin    = canAccess("admin");

  const [openId, setOpenId] = useState<string | null>(() => {
    const active = allModules.find((m) => moduleIsActive(m, pathname));
    return active?.id ?? null;
  });

  // Defaults idênticos no servidor e no 1º render do cliente (evita mismatch de
  // hidratação). As preferências salvas são lidas após montar, no efeito abaixo.
  const [panelWidth, setPanelWidth] = useState<number>(PANEL_DEFAULT);
  const [stripCollapsed, setStripCollapsed] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState(false);
  const [modKey, setModKey] = useState("⌘");

  useEffect(() => {
    setPanelWidth(parseInt(localStorage.getItem("sidebar-panel-w") ?? "") || PANEL_DEFAULT);
    setStripCollapsed(localStorage.getItem("sidebar-collapsed") === "1");
    setHydrated(true);
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

  // Persist settings (só depois de carregar as preferências, p/ não sobrescrever)
  useEffect(() => { if (hydrated) localStorage.setItem("sidebar-panel-w", String(panelWidth)); }, [panelWidth, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem("sidebar-collapsed", stripCollapsed ? "1" : "0"); }, [stripCollapsed, hydrated]);

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

  const openModuleBruto = allModules.find((m) => m.id === openId) ?? null;
  // Configurações carrega a seção "Sistema" (Administração) — só para admin
  const openModule = openModuleBruto && openModuleBruto.id === "configuracoes" && !showAdmin
    ? { ...openModuleBruto, sections: openModuleBruto.sections.filter((sec) => sec.kind !== "Sistema") }
    : openModuleBruto;
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

            {/* Notificações migraram para o topo (NotificationCenter, ao lado do
                seletor de empresa no TabBar). */}

            {/* Alternar tema claro/escuro */}
            <StripTooltip label="Tema claro / escuro">
              <ThemeToggle />
            </StripTooltip>

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
            className="h-full bg-card border-r border-border flex flex-col overflow-hidden relative"
            style={{ width: panelWidth }}
          >
            {openModule && (
              <>
                {/* Panel header */}
                <div className="flex items-center gap-2.5 px-4 h-16 border-b border-border shrink-0">
                  <openModule.icon className="w-4 h-4 text-primary shrink-0" />
                  <span className="font-semibold text-foreground text-sm">{openModule.label}</span>
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
                              className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground/60 cursor-not-allowed"
                              title="Em breve"
                            >
                              <span className="flex shrink-0 items-center justify-center w-5 h-5 rounded-md bg-muted">
                                <Icon className="w-3 h-3 text-muted-foreground/50" />
                              </span>
                              <span className="flex-1 truncate">{item.label}</span>
                              <span className="text-[9px] font-semibold bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">breve</span>
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
                                ? "bg-primary/10 text-primary font-medium"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
                  <div className="border-t border-border p-3 space-y-1 shrink-0">
                    <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
                      <div className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                        user.perfil === "ADMIN" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                      )}>
                        {userInitials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{user.nome}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
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
              <div className="w-0.5 h-8 rounded-full bg-border group-hover:bg-primary transition-colors" />
              <GripVertical className="absolute w-3 h-3 text-muted-foreground/50 group-hover:text-primary transition-colors opacity-0 group-hover:opacity-100" />
            </div>
          </div>
        )}
      </aside>

      {/* ── Notification panel (portal) ─────────────────────────────────────── */}
    </>
  );
}
