/**
 * route-registry.ts
 *
 * Single source of truth for route metadata:
 *  - label, group, section, icon
 *  - icon background colour (matching Sidebar kindStyle)
 *
 * Imported by CommandPalette (search) and TabBar (tab icons).
 */

import {
  LayoutDashboard,
  GitBranch, UserCheck, Layers, Users,
  Package, Tag, Ruler, MapPin,
  Truck, CalendarDays, CreditCard, CircleDot,
  ShoppingCart, Route,
  PackageSearch, ArrowLeftRight, ClipboardList, ClipboardCheck,
  FileBarChart2, PieChart, BarChart3, Activity,
  ThumbsUp, FileSearch, FilePlus, PackageCheck,
  TrendingUp, TrendingDown,
  UserCog, ShieldCheck,
  Settings2, Plug,
  Building2, Clock,
  Wrench, Database, MessageCircle, Workflow, Boxes, FlaskConical, ListChecks, Calculator, BookOpen,
  Landmark, Wallet, FolderTree, Repeat, CalendarClock, FileCheck2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ── Icon colours (mirrors Sidebar kindStyle) ──────────────────────────────────
export type IconColor = {
  bg:      string; // e.g. "bg-rose-50"
  text:    string; // e.g. "text-rose-600"
  selBg:   string; // darker variant for selected/active state
  selText: string;
};

export const SECTION_COLORS: Record<string, IconColor> = {
  "Relatórios":       { bg: "bg-rose-50",    text: "text-rose-600",    selBg: "bg-rose-100",    selText: "text-rose-700"    },
  "Estoque":          { bg: "bg-emerald-50", text: "text-emerald-600", selBg: "bg-emerald-100", selText: "text-emerald-700" },
  "Fluxo de Compras": { bg: "bg-amber-50",   text: "text-amber-600",   selBg: "bg-amber-100",   selText: "text-amber-700"   },
  "Aprovações":       { bg: "bg-emerald-50", text: "text-emerald-600", selBg: "bg-emerald-100", selText: "text-emerald-700" },
  "Processos":        { bg: "bg-blue-50",    text: "text-blue-600",    selBg: "bg-blue-100",    selText: "text-blue-700"    },
  "Geral":            { bg: "bg-blue-50",    text: "text-blue-600",    selBg: "bg-blue-100",    selText: "text-blue-700"    },
  "Almoxarifado":     { bg: "bg-emerald-50", text: "text-emerald-600", selBg: "bg-emerald-100", selText: "text-emerald-700" },
  "Sistema":          { bg: "bg-slate-100",  text: "text-slate-500",   selBg: "bg-slate-200",   selText: "text-slate-600"   },
  "Configurações":    { bg: "bg-violet-50",  text: "text-violet-600",  selBg: "bg-violet-100",  selText: "text-violet-700"  },
  "Manutenção":       { bg: "bg-orange-50",  text: "text-orange-600",  selBg: "bg-orange-100",  selText: "text-orange-700"  },
  "Comercial":        { bg: "bg-blue-50",    text: "text-blue-600",    selBg: "bg-blue-100",    selText: "text-blue-700"    },
  "Financeiro":       { bg: "bg-teal-50",    text: "text-teal-600",    selBg: "bg-teal-100",    selText: "text-teal-700"    },
  "Compras":            { bg: "bg-amber-50",   text: "text-amber-600",   selBg: "bg-amber-100",   selText: "text-amber-700"   },
  "Cadastros":          { bg: "bg-violet-50",  text: "text-violet-600",  selBg: "bg-violet-100",  selText: "text-violet-700"  },
  "Relatórios Compras": { bg: "bg-rose-50",    text: "text-rose-600",    selBg: "bg-rose-100",    selText: "text-rose-700"    },
  "Produção":           { bg: "bg-cyan-50",    text: "text-cyan-600",    selBg: "bg-cyan-100",    selText: "text-cyan-700"     },
};

export const DEFAULT_COLOR: IconColor = {
  bg: "bg-gray-100", text: "text-gray-500", selBg: "bg-gray-200", selText: "text-gray-600",
};

// ── Route type ────────────────────────────────────────────────────────────────
export type RouteEntry = {
  href:      string;
  label:     string;
  group:     string;
  section:   string;
  icon:      LucideIcon;
  keywords?: string;
};

// ── Registry ──────────────────────────────────────────────────────────────────
export const ROUTES: RouteEntry[] = [
  { href: "/",                                     label: "Dashboard",               group: "Início",         section: "Geral",            icon: LayoutDashboard },

  { href: "/empresa/filiais",                      label: "Filiais",                 group: "Empresa",        section: "Geral",            icon: GitBranch },
  { href: "/empresa/colaboradores",                label: "Colaboradores",           group: "Empresa",        section: "Geral",            icon: UserCheck },
  { href: "/empresa/setores",                      label: "Setores",                 group: "Empresa",        section: "Geral",            icon: Layers },
  { href: "/clientes",                             label: "Clientes",                group: "Empresa",        section: "Geral",            icon: Users },

  { href: "/suprimentos/produtos",                 label: "Produtos",                group: "Empresa",        section: "Almoxarifado",     icon: Package },
  { href: "/suprimentos/tipos-produto",            label: "Tipos de Produto",        group: "Empresa",        section: "Almoxarifado",     icon: Tag },
  { href: "/suprimentos/unidades",                 label: "Unidades de Medida",      group: "Empresa",        section: "Almoxarifado",     icon: Ruler },
  { href: "/suprimentos/locais-estoque",           label: "Locais de Estoque",       group: "Almoxarifado",   section: "Estoque",          icon: MapPin },

  { href: "/suprimentos/fornecedores",             label: "Fornecedores",            group: "Empresa",        section: "Compras",          icon: Truck },
  { href: "/suprimentos/condicoes-pagamento",      label: "Condições de Pagamento",  group: "Empresa",        section: "Compras",          icon: CalendarDays },
  { href: "/suprimentos/formas-pagamento",         label: "Formas de Pagamento",     group: "Empresa",        section: "Compras",          icon: CreditCard },
  { href: "/empresa/centros-custo",                label: "Centros de Custo",        group: "Empresa",        section: "Financeiro",       icon: CircleDot },

  { href: "/comercial/tabelas-preco",              label: "Tabelas de Preço",        group: "Comercial",      section: "Cadastros",        icon: Tag,            keywords: "tabela preço lista precos" },
  { href: "/comercial/produtos-venda",             label: "Produtos para Venda",     group: "Comercial",      section: "Cadastros",        icon: Package,        keywords: "produto vendável catálogo" },
  { href: "/comercial/motoristas",                 label: "Motoristas",              group: "Comercial",      section: "Cadastros",        icon: Truck,          keywords: "motorista cnh cpf entrega" },
  { href: "/pedidos-venda",                        label: "Pedidos de Venda",        group: "Comercial",      section: "Comercial",        icon: ShoppingCart },
  { href: "/comercial/saldo-clientes",             label: "Saldo por Cliente",       group: "Comercial",      section: "Comercial",        icon: PackageSearch,  keywords: "saldo cliente pendente falta entregar entrega minuta agendar" },
  { href: "/comercial/minutas",                    label: "Minutas",                 group: "Comercial",      section: "Comercial",        icon: Truck,          keywords: "minuta entrega saída motorista placa" },
  { href: "/comercial/agenda-entregas",            label: "Agenda de Entregas",      group: "Comercial",      section: "Comercial",        icon: Route,          keywords: "agenda entregas roteiro roteirização minutas calendário" },
  { href: "/comodato",                             label: "Comodato",                group: "Comercial",      section: "Comercial",        icon: Package,        keywords: "comodato vasilhame retornável saldo cliente" },
  { href: "/comercial/relatorios/faturamento",     label: "Faturamento",             group: "Comercial",      section: "Relatórios",       icon: BarChart3,      keywords: "faturamento volume faturado vendas receita relatório" },

  { href: "/suprimentos/estoque",                  label: "Posição de Estoque",      group: "Almoxarifado",   section: "Estoque",          icon: PackageSearch },
  { href: "/suprimentos/movimentacoes",            label: "Movimentações",           group: "Almoxarifado",   section: "Estoque",          icon: ArrowLeftRight },
  { href: "/suprimentos/requisicoes-materiais",    label: "Req/Dev de Materiais",    group: "Almoxarifado",   section: "Estoque",          icon: ClipboardList,  keywords: "requisição devolução materiais" },
  { href: "/suprimentos/inventarios-materiais",    label: "Inventário",              group: "Almoxarifado",   section: "Estoque",          icon: ClipboardCheck },

  { href: "/suprimentos/relatorios/movimentacoes",  label: "Entradas e Saídas",       group: "Almoxarifado",   section: "Relatórios",       icon: FileBarChart2 },
  { href: "/suprimentos/relatorios/curva-abc",      label: "Curva ABC",               group: "Almoxarifado",   section: "Relatórios",       icon: PieChart },
  { href: "/suprimentos/relatorios/imd",            label: "IMD — Demandas",          group: "Almoxarifado",   section: "Relatórios",       icon: BarChart3,      keywords: "imd demandas" },
  { href: "/suprimentos/relatorios/consumo",        label: "Análise de Consumo",      group: "Almoxarifado",   section: "Relatórios",       icon: Activity },
  { href: "/suprimentos/relatorios/caracterizacao", label: "Caracterização",          group: "Almoxarifado",   section: "Relatórios",       icon: FileBarChart2,  keywords: "caracterização produtos laudo" },

  { href: "/aprovacoes",                           label: "Minhas Aprovações",       group: "Compras",        section: "Aprovações",       icon: ThumbsUp },
  { href: "/compras/necessidades",                 label: "Solicitação de Compras",  group: "Compras",        section: "Fluxo de Compras", icon: ClipboardList,  keywords: "SC necessidade" },
  { href: "/suprimentos/cotacoes",                 label: "Cotação de Compras",      group: "Compras",        section: "Fluxo de Compras", icon: FileSearch,     keywords: "CT cotação" },
  { href: "/suprimentos/pedidos-compra",           label: "Pedido de Compras",       group: "Compras",        section: "Fluxo de Compras", icon: FilePlus,       keywords: "PC pedido" },
  { href: "/suprimentos/conferencias",             label: "Doc. de Entrada",         group: "Compras",        section: "Fluxo de Compras", icon: PackageCheck,   keywords: "DE conferência entrada NF nota fiscal" },

  { href: "/compras/relatorios/spend",             label: "SPEND",                   group: "Compras",        section: "Relatórios Compras", icon: BarChart3,   keywords: "spend gastos fornecedor" },
  { href: "/compras/relatorios/sla",               label: "SLA",                     group: "Compras",        section: "Relatórios Compras", icon: Clock,       keywords: "sla prazo nível serviço" },
  { href: "/compras/relatorios/otd",               label: "OTD",                     group: "Compras",        section: "Relatórios Compras", icon: Truck,       keywords: "otd entrega prazo" },

  { href: "/financeiro/contas",                    label: "Contas Bancárias",        group: "Financeiro",     section: "Financeiro",       icon: Wallet,         keywords: "conta banco saldo caixa extrato transferência" },
  { href: "/financeiro/bancos",                    label: "Bancos",                  group: "Financeiro",     section: "Financeiro",       icon: Landmark,       keywords: "banco febraban" },
  { href: "/financeiro/plano-contas",              label: "Plano de Contas",         group: "Financeiro",     section: "Financeiro",       icon: FolderTree,     keywords: "categoria plano contas grupo receita despesa" },
  { href: "/contas-receber",                       label: "Contas a Receber",        group: "Financeiro",     section: "Financeiro",       icon: TrendingUp },
  { href: "/contas-pagar",                         label: "Contas a Pagar",          group: "Financeiro",     section: "Financeiro",       icon: TrendingDown },
  { href: "/financeiro/agenda",                    label: "Agenda Financeira",       group: "Financeiro",     section: "Financeiro",       icon: CalendarClock, keywords: "agenda vencimento baixa lote a vencer" },
  { href: "/financeiro/recorrencias",              label: "Recorrências",            group: "Financeiro",     section: "Financeiro",       icon: Repeat,        keywords: "recorrência recorrente mensal aluguel salário fixa" },
  { href: "/financeiro/conciliacao",               label: "Conciliação (OFX)",       group: "Financeiro",     section: "Financeiro",       icon: FileCheck2,    keywords: "conciliação ofx extrato banco importar conciliar" },
  { href: "/fluxo-caixa",                          label: "Fluxo de Caixa",          group: "Financeiro",     section: "Financeiro",       icon: BarChart3 },

  { href: "/admin/usuarios",                       label: "Usuários",                group: "Administração",  section: "Sistema",          icon: UserCog },
  { href: "/admin/perfis",                         label: "Perfis de Acesso",        group: "Administração",  section: "Sistema",          icon: ShieldCheck },
  { href: "/admin/consolidado",                    label: "Consolidado do Grupo",    group: "Administração",  section: "Sistema",          icon: Building2,      keywords: "consolidado grupo multiempresa empresas intragrupo" },

  { href: "/pcm/dashboard",                        label: "PCM — Resultados",        group: "PCM",            section: "Manutenção",       icon: BarChart3,      keywords: "pcm manutenção resultados dashboard" },
  { href: "/pcm/ordens",                           label: "Relatório de O.S.",       group: "PCM",            section: "Manutenção",       icon: ClipboardList,  keywords: "pcm ordens serviço OS manutenção" },

  { href: "/pcp/dashboard",                        label: "Dashboard do PCP",        group: "PCP",            section: "Produção",         icon: BarChart3,      keywords: "pcp dashboard indicadores forno wip biomassa perdas simulação" },
  { href: "/pcp/ordens",                           label: "Ordens de Produção",      group: "PCP",            section: "Produção",         icon: ClipboardList,  keywords: "pcp ordem produção op apontamento etapa" },
  { href: "/pcp/operacoes",                        label: "Operações (fila)",        group: "PCP",            section: "Produção",         icon: ListChecks,     keywords: "pcp operação fila chão etapa centro trabalho apontar" },
  { href: "/pcp/planejamento",                     label: "Planejamento (MPS/MRP)",  group: "PCP",            section: "Produção",         icon: Calculator,     keywords: "pcp mps mrp planejamento demanda necessidade insumo plano mestre" },
  { href: "/pcp/sequenciamento",                   label: "Sequenciamento (forno)",  group: "PCP",            section: "Produção",         icon: CalendarClock,  keywords: "pcp sequenciamento forno gargalo cronograma capacidade finita programação" },
  { href: "/pcp/ajuda",                            label: "Como usar o PCP",         group: "PCP",            section: "Produção",         icon: BookOpen,       keywords: "pcp ajuda guia documentação como usar tutorial manual" },
  { href: "/pcp/engenharia",                       label: "Engenharia do Produto",   group: "PCP",            section: "Produção",         icon: FlaskConical,   keywords: "pcp engenharia estrutura bom insumo embalagem produto" },
  { href: "/pcp/fluxos",                           label: "Fluxos de Produção",      group: "PCP",            section: "Produção",         icon: Workflow,       keywords: "pcp produção fluxo roteiro editor n8n" },
  { href: "/pcp/centros-trabalho",                 label: "Centros de Trabalho",     group: "PCP",            section: "Produção",         icon: Boxes,          keywords: "pcp centro trabalho recurso forno secagem" },

  { href: "/configuracoes/aprovacoes",             label: "Aprovações",              group: "Configurações",  section: "Configurações",    icon: Settings2 },
  { href: "/configuracoes/integracoes",            label: "Integrações",             group: "Configurações",  section: "Configurações",    icon: Plug },
  { href: "/configuracoes/integracoes/db-engeman", label: "Integração DB Engeman",   group: "Configurações",  section: "Configurações",    icon: Database,       keywords: "engeman integração banco dados" },
  { href: "/configuracoes/integracoes/telegram",   label: "Integração Telegram",     group: "Configurações",  section: "Configurações",    icon: MessageCircle,  keywords: "telegram notificação bot" },
  { href: "/configuracoes/integracoes/whatsapp",   label: "Integração WhatsApp",     group: "Configurações",  section: "Configurações",    icon: MessageCircle,  keywords: "whatsapp notificação mensagem" },
];

// ── Lookup helpers ────────────────────────────────────────────────────────────

/** Exact-match then longest-prefix match */
export function findRoute(href: string): RouteEntry | undefined {
  const exact = ROUTES.find((r) => r.href === href);
  if (exact) return exact;
  // longest prefix (e.g. /suprimentos/produtos/[id] → /suprimentos/produtos)
  return ROUTES
    .filter((r) => href.startsWith(r.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function routeColor(section: string): IconColor {
  return SECTION_COLORS[section] ?? DEFAULT_COLOR;
}

/** Empresa module uses Building2 as the "parent" icon for sub-pages */
export const EMPRESA_ICON = Building2;
