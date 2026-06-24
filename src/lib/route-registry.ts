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
  Wrench, Database, MessageCircle, Workflow, Boxes, FlaskConical, ListChecks, Calculator, BookOpen, Factory,
  Landmark, Wallet, FolderTree, Repeat, CalendarClock, FileCheck2,
  Megaphone, Target, Map as MapIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ── Icon colours (mirrors Sidebar kindStyle) ──────────────────────────────────
export type IconColor = {
  bg:      string; // e.g. "bg-rose-50"
  text:    string; // e.g. "text-rose-600"
  selBg:   string; // darker variant for selected/active state
  selText: string;
};

// Chips de ícone por seção. Cada hue ganha variante dark: (fundo translúcido +
// texto mais claro) p/ legibilidade no escuro; no claro fica como antes.
export const SECTION_COLORS: Record<string, IconColor> = {
  "Relatórios":       { bg: "bg-rose-50 dark:bg-rose-500/15",       text: "text-rose-600 dark:text-rose-400",       selBg: "bg-rose-100 dark:bg-rose-500/25",       selText: "text-rose-700 dark:text-rose-300"    },
  "Estoque":          { bg: "bg-emerald-50 dark:bg-emerald-500/15", text: "text-emerald-600 dark:text-emerald-400", selBg: "bg-emerald-100 dark:bg-emerald-500/25", selText: "text-emerald-700 dark:text-emerald-300" },
  "Fluxo de Compras": { bg: "bg-amber-50 dark:bg-amber-500/15",     text: "text-amber-600 dark:text-amber-400",     selBg: "bg-amber-100 dark:bg-amber-500/25",     selText: "text-amber-700 dark:text-amber-300"   },
  "Aprovações":       { bg: "bg-emerald-50 dark:bg-emerald-500/15", text: "text-emerald-600 dark:text-emerald-400", selBg: "bg-emerald-100 dark:bg-emerald-500/25", selText: "text-emerald-700 dark:text-emerald-300" },
  "Processos":        { bg: "bg-blue-50 dark:bg-blue-500/15",       text: "text-blue-600 dark:text-blue-400",       selBg: "bg-blue-100 dark:bg-blue-500/25",       selText: "text-blue-700 dark:text-blue-300"    },
  "Geral":            { bg: "bg-blue-50 dark:bg-blue-500/15",       text: "text-blue-600 dark:text-blue-400",       selBg: "bg-blue-100 dark:bg-blue-500/25",       selText: "text-blue-700 dark:text-blue-300"    },
  "Almoxarifado":     { bg: "bg-emerald-50 dark:bg-emerald-500/15", text: "text-emerald-600 dark:text-emerald-400", selBg: "bg-emerald-100 dark:bg-emerald-500/25", selText: "text-emerald-700 dark:text-emerald-300" },
  "Sistema":          { bg: "bg-slate-100 dark:bg-slate-500/15",    text: "text-slate-500 dark:text-slate-400",     selBg: "bg-slate-200 dark:bg-slate-500/25",     selText: "text-slate-600 dark:text-slate-300"   },
  "Configurações":    { bg: "bg-violet-50 dark:bg-violet-500/15",   text: "text-violet-600 dark:text-violet-400",   selBg: "bg-violet-100 dark:bg-violet-500/25",   selText: "text-violet-700 dark:text-violet-300"  },
  "Manutenção":       { bg: "bg-orange-50 dark:bg-orange-500/15",   text: "text-orange-600 dark:text-orange-400",   selBg: "bg-orange-100 dark:bg-orange-500/25",   selText: "text-orange-700 dark:text-orange-300"  },
  "Faturamento":        { bg: "bg-blue-50 dark:bg-blue-500/15",     text: "text-blue-600 dark:text-blue-400",       selBg: "bg-blue-100 dark:bg-blue-500/25",       selText: "text-blue-700 dark:text-blue-300"    },
  "Financeiro":       { bg: "bg-teal-50 dark:bg-teal-500/15",       text: "text-teal-600 dark:text-teal-400",       selBg: "bg-teal-100 dark:bg-teal-500/25",       selText: "text-teal-700 dark:text-teal-300"    },
  "Compras":            { bg: "bg-amber-50 dark:bg-amber-500/15",   text: "text-amber-600 dark:text-amber-400",     selBg: "bg-amber-100 dark:bg-amber-500/25",     selText: "text-amber-700 dark:text-amber-300"   },
  "Cadastros":          { bg: "bg-violet-50 dark:bg-violet-500/15", text: "text-violet-600 dark:text-violet-400",   selBg: "bg-violet-100 dark:bg-violet-500/25",   selText: "text-violet-700 dark:text-violet-300"  },
  "Relatórios Compras": { bg: "bg-rose-50 dark:bg-rose-500/15",     text: "text-rose-600 dark:text-rose-400",       selBg: "bg-rose-100 dark:bg-rose-500/25",       selText: "text-rose-700 dark:text-rose-300"    },
  "Produção":           { bg: "bg-cyan-50 dark:bg-cyan-500/15",     text: "text-cyan-600 dark:text-cyan-400",       selBg: "bg-cyan-100 dark:bg-cyan-500/25",       selText: "text-cyan-700 dark:text-cyan-300"     },
  "Inteligência Comercial": { bg: "bg-fuchsia-50 dark:bg-fuchsia-500/15", text: "text-fuchsia-600 dark:text-fuchsia-400", selBg: "bg-fuchsia-100 dark:bg-fuchsia-500/25", selText: "text-fuchsia-700 dark:text-fuchsia-300" },
};

export const DEFAULT_COLOR: IconColor = {
  bg: "bg-muted", text: "text-muted-foreground", selBg: "bg-muted", selText: "text-foreground",
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
  { href: "/suprimentos/unidades",                 label: "Unidades de Medida",      group: "Empresa",        section: "Almoxarifado",     icon: Ruler },
  { href: "/suprimentos/locais-estoque",           label: "Locais de Estoque",       group: "Almoxarifado",   section: "Estoque",          icon: MapPin },

  { href: "/suprimentos/fornecedores",             label: "Fornecedores",            group: "Empresa",        section: "Compras",          icon: Truck },
  { href: "/suprimentos/condicoes-pagamento",      label: "Condições de Pagamento",  group: "Empresa",        section: "Compras",          icon: CalendarDays },
  { href: "/suprimentos/formas-pagamento",         label: "Formas de Pagamento",     group: "Empresa",        section: "Compras",          icon: CreditCard },
  { href: "/empresa/centros-custo",                label: "Centros de Custo",        group: "Empresa",        section: "Financeiro",       icon: CircleDot },

  { href: "/marketing",                            label: "Painel de Marketing",     group: "Marketing",        section: "Geral",            icon: Megaphone,      keywords: "marketing campanha campanhas lead leads divulgação publicidade" },
  { href: "/marketing/inteligencia-comercial",      label: "Concorrentes",            group: "Marketing",        section: "Inteligência Comercial", icon: Target,  keywords: "inteligencia comercial ic concorrente concorrentes mercado preço precos fornecedor revendedor" },
  { href: "/marketing/inteligencia-comercial/relatorio-precos", label: "Preço de Mercado", group: "Marketing",   section: "Inteligência Comercial", icon: BarChart3, keywords: "preço médio mercado concorrente relatório comparativo ic inteligencia comercial precos" },
  { href: "/marketing/inteligencia-comercial/mapa", label: "Geomarketing",            group: "Marketing",        section: "Inteligência Comercial", icon: MapIcon, keywords: "geomarketing mapa concorrentes localização leaflet ic inteligencia comercial" },

  { href: "/comercial/tabelas-preco",              label: "Tabelas de Preço",        group: "Faturamento",      section: "Cadastros",        icon: Tag,            keywords: "tabela preço lista precos" },
  { href: "/comercial/produtos-venda",             label: "Produtos para Venda",     group: "Faturamento",      section: "Cadastros",        icon: Package,        keywords: "produto vendável catálogo" },
  { href: "/comercial/motoristas",                 label: "Motoristas",              group: "Faturamento",      section: "Cadastros",        icon: Truck,          keywords: "motorista cnh cpf entrega" },
  { href: "/pedidos-venda",                        label: "Pedidos de Venda",        group: "Faturamento",      section: "Faturamento",        icon: ShoppingCart },
  { href: "/comercial/saldo-clientes",             label: "Saldos",                  group: "Faturamento",      section: "Faturamento",        icon: PackageSearch,  keywords: "saldo saldos cliente material pago pendente falta entregar entrega minuta agendar" },
  { href: "/comercial/minutas",                    label: "Minutas",                 group: "Faturamento",      section: "Faturamento",        icon: Truck,          keywords: "minuta entrega saída motorista placa" },
  { href: "/comercial/agenda-entregas",            label: "Agenda de Entregas",      group: "Faturamento",      section: "Faturamento",        icon: Route,          keywords: "agenda entregas roteiro roteirização minutas calendário" },
  { href: "/comodato",                             label: "Comodato",                group: "Faturamento",      section: "Faturamento",        icon: Package,        keywords: "comodato vasilhame retornável saldo cliente" },
  { href: "/comercial/relatorios/faturamento",     label: "Faturamento",             group: "Faturamento",      section: "Relatórios",       icon: BarChart3,      keywords: "faturamento volume faturado vendas receita relatório" },

  { href: "/suprimentos/estoque",                  label: "Posição de Estoque",      group: "Almoxarifado",   section: "Estoque",          icon: PackageSearch },
  { href: "/suprimentos/movimentacoes",            label: "Movimentações",           group: "Almoxarifado",   section: "Estoque",          icon: ArrowLeftRight },
  { href: "/suprimentos/estoque-terceiros",        label: "Estoque de Terceiros",    group: "Almoxarifado",   section: "Estoque",          icon: PackageSearch,  keywords: "terceiros guarda armazenagem cliente dono proprietario" },
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

  { href: "/financeiro/contas",                    label: "Contas",                  group: "Financeiro",     section: "Financeiro",       icon: Wallet,         keywords: "conta banco saldo caixa extrato transferência dinheiro" },
  { href: "/financeiro/bancos",                    label: "Bancos",                  group: "Financeiro",     section: "Financeiro",       icon: Landmark,       keywords: "banco febraban" },
  { href: "/financeiro/naturezas",                 label: "Naturezas Financeiras",   group: "Financeiro",     section: "Financeiro",       icon: ArrowLeftRight, keywords: "natureza financeira entrada saida fluxo caixa grupo subgrupo classificação título" },
  { href: "/contabilidade/plano-contas",           label: "Plano de Contas Contábil", group: "Contabilidade",  section: "Cadastros",    icon: Calculator,     keywords: "contabilidade plano contas contábil ativo passivo patrimonio resultado devedora credora razão balancete" },
  { href: "/contabilidade/imobilizado",            label: "Imobilizado",              group: "Contabilidade",  section: "Cadastros",    icon: Calculator,     keywords: "contabilidade imobilizado ativo não circulante depreciação bem patrimônio vida útil" },
  { href: "/contabilidade/lancamentos",            label: "Diário Contábil",          group: "Contabilidade",  section: "Processos",    icon: Calculator,     keywords: "contabilidade diário lançamentos partidas dobradas débito crédito razão" },
  { href: "/contabilidade/fechamento",             label: "Encerramento do Exercício", group: "Contabilidade",  section: "Processos",    icon: Calculator,     keywords: "contabilidade fechamento encerramento exercício período resultado lucro prejuízo trava patrimônio líquido" },
  { href: "/contabilidade/custeio",                label: "CPV",                      group: "Contabilidade",  section: "Processos",    icon: Calculator,     keywords: "cpv custo produtos vendidos contabilidade custeio cif mod taxa indireto biomassa energia combustível folha mão de obra acabado pep absorção" },
  { href: "/contabilidade/razao",                  label: "Razão",                    group: "Contabilidade",  section: "Relatórios",    icon: Calculator,     keywords: "contabilidade razão livro razao extrato conta auxiliar cliente fornecedor saldo" },
  { href: "/contabilidade/balancete",              label: "Balancete",                group: "Contabilidade",  section: "Relatórios",    icon: Calculator,     keywords: "contabilidade balancete verificação saldo débito crédito conta" },
  { href: "/contabilidade/dre",                    label: "DRE",                      group: "Contabilidade",  section: "Relatórios",    icon: Calculator,     keywords: "contabilidade dre demonstração resultado receita custo despesa lucro prejuízo" },
  { href: "/contabilidade/balanco",                label: "Balanço Patrimonial",      group: "Contabilidade",  section: "Relatórios",    icon: Calculator,     keywords: "contabilidade balanço patrimonial ativo passivo patrimonio liquido posição" },
  { href: "/contas-receber",                       label: "Contas a Receber",        group: "Financeiro",     section: "Financeiro",       icon: TrendingUp },
  { href: "/contas-pagar",                         label: "Contas a Pagar",          group: "Financeiro",     section: "Financeiro",       icon: TrendingDown },
  { href: "/financeiro/agenda",                    label: "Agenda Financeira",       group: "Financeiro",     section: "Financeiro",       icon: CalendarClock, keywords: "agenda vencimento baixa lote a vencer" },
  { href: "/financeiro/recorrencias",              label: "Recorrências",            group: "Financeiro",     section: "Financeiro",       icon: Repeat,        keywords: "recorrência recorrente mensal aluguel salário fixa" },
  { href: "/financeiro/conciliacao",               label: "Conciliação (OFX)",       group: "Financeiro",     section: "Financeiro",       icon: FileCheck2,    keywords: "conciliação ofx extrato banco importar conciliar" },
  { href: "/fluxo-caixa",                          label: "Fluxo de Caixa",          group: "Financeiro",     section: "Financeiro",       icon: BarChart3 },

  { href: "/rh/folhas",                            label: "Folhas de Pagamento",     group: "RH",             section: "Processos",        icon: Users, keywords: "folha pagamento salário rh holerite inss fgts irrf colaborador" },

  { href: "/admin/usuarios",                       label: "Usuários",                group: "Administração",  section: "Sistema",          icon: UserCog },
  { href: "/admin/perfis",                         label: "Perfis de Acesso",        group: "Administração",  section: "Sistema",          icon: ShieldCheck },
  { href: "/admin/empresas",                       label: "Empresas do Grupo",       group: "Administração",  section: "Sistema",          icon: Building2,      keywords: "empresas grupo multiempresa cadastro cnpj" },
  { href: "/admin/consolidado",                    label: "Consolidado do Grupo",    group: "Administração",  section: "Sistema",          icon: Building2,      keywords: "consolidado grupo multiempresa empresas intragrupo" },

  { href: "/pcm/ordens",                           label: "Relatório de O.S.",       group: "PCM",            section: "Manutenção",       icon: ClipboardList,  keywords: "pcm ordens serviço OS manutenção" },
  { href: "/pcm/quadro-os",                        label: "Quadro de O.S.",          group: "PCM",            section: "Manutenção",       icon: ClipboardList,  keywords: "quadro os setor executante pendente kanban responsavel" },
  { href: "/pcm/planos",                           label: "Planos de Manutenção",    group: "PCM",            section: "Manutenção",       icon: CalendarClock,  keywords: "planos manutencao preventiva execucao aderencia pmp" },

  { href: "/pcp/centros-trabalho",                 label: "Centros de Trabalho",     group: "PCP",            section: "Estrutura",        icon: Boxes,          keywords: "pcp centro trabalho recurso forno secagem" },
  { href: "/pcp/estados-wip",                      label: "Estados de WIP",          group: "PCP",            section: "Estrutura",        icon: Layers,         keywords: "pcp wip estado fase úmido seco queimado acabado produto em processo" },
  { href: "/pcp/fluxos",                           label: "Fluxos de Produção",      group: "PCP",            section: "Estrutura",        icon: Workflow,       keywords: "pcp produção fluxo roteiro editor n8n" },
  { href: "/pcp/engenharia",                       label: "Engenharia do Produto",   group: "PCP",            section: "Estrutura",        icon: FlaskConical,   keywords: "pcp engenharia estrutura bom insumo embalagem produto" },
  { href: "/pcp/chao",                             label: "Chão de Fábrica",         group: "PCP",            section: "Planejamento/Apontamento",     icon: Factory,        keywords: "pcp chão fábrica produção apontamento" },
  { href: "/pcp/ordens",                           label: "Ordens de Produção",      group: "PCP",            section: "Planejamento/Apontamento",     icon: ClipboardList,  keywords: "pcp ordem produção op apontamento etapa" },
  { href: "/pcp/operacoes",                        label: "Operações (fila)",        group: "PCP",            section: "Planejamento/Apontamento",     icon: ListChecks,     keywords: "pcp operação fila chão etapa centro trabalho apontar" },
  { href: "/pcp/planejamento",                     label: "Planejamento (MPS/MRP)",  group: "PCP",            section: "Planejamento/Apontamento",     icon: Calculator,     keywords: "pcp mps mrp planejamento demanda necessidade insumo plano mestre" },
  { href: "/pcp/dashboard",                        label: "Dashboard do PCP",        group: "PCP",            section: "Outros",           icon: BarChart3,      keywords: "pcp dashboard indicadores forno wip biomassa perdas simulação" },
  { href: "/pcp/sequenciamento",                   label: "Sequenciamento (forno)",  group: "PCP",            section: "Outros",           icon: CalendarClock,  keywords: "pcp sequenciamento forno gargalo cronograma capacidade finita programação" },
  { href: "/pcp/ajuda",                            label: "Como usar o PCP",         group: "PCP",            section: "Outros",           icon: BookOpen,       keywords: "pcp ajuda guia documentação como usar tutorial manual" },

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
