// Menu lateral (módulos → seções → telas). Fonte única: o Sidebar desenha a
// partir daqui e o buscador (⌘K, route-registry) inclui sozinho toda tela que
// estiver aqui — tela nova entra só neste arquivo (+ modules.ts p/ permissão).
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
  FileSignature,
  Building2,
  Truck,
  ClipboardList,
  ClipboardCheck,
  PackageSearch,
  ShoppingBag,
  CreditCard,
  Settings2,
  CircleDot,
  FilePlus,
  Tag,
  Ruler,
  MapPin,
  ArrowLeftRight,
  CalendarDays,
  Banknote,
  FileSearch,
  PackageCheck,
  PieChart,
  UserCog,
  ShieldCheck,
  HardHat,
  Stethoscope,
  CalendarCheck,
  GraduationCap,
  Cog,
  Siren,
  GitBranch,
  UserCheck,
  Plug,
  ThumbsUp,
  Factory,
  Workflow,
  Boxes,
  FlaskConical,
  Calculator,
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
  Receipt,
  Hash,
  Scale,
  Megaphone,
  Target,
  Map as MapIcon,
  Trash2,
  Filter,
  UserPlus,
  Globe,
  FolderKanban,
  Kanban,
  ListTodo,
  FileArchive,
  LineChart,
  Inbox,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NavItem {
  href: string;
  label: string;
  icon?: LucideIcon;
  soon?: boolean;
  /** Quando true, só fica ativo na rota exata (não em sub-rotas). Usado quando
   *  o href é prefixo de outros itens do menu (ex.: /marketing). */
  exact?: boolean;
}

export interface SubSection {
  kind: "Cadastros" | "Processos" | "Estoque" | "Fluxo de Compras" | "Almoxarifado" | "Relatórios" | "Sistema" | "Comercial" | "Compras" | "Financeiro" | "Configurações" | "Aprovações" | "Manutenção" | "Geral" | "Produção" | "Estrutura" | "Planejamento/Apontamento" | "Outros" | "Inteligência Comercial" | "Funis & Leads";
  items: NavItem[];
}

export interface Module {
  id: string;
  label: string;
  icon: LucideIcon;
  sections: SubSection[];
}

// ── Data ──────────────────────────────────────────────────────────────────────

export const mainModules: Module[] = [
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
        kind: "Funis & Leads",
        items: [
          { href: "/marketing/funis",     label: "Funis",            icon: Filter },
          { href: "/marketing/campanhas", label: "Campanhas",        icon: Megaphone },
          { href: "/marketing/leads",     label: "Leads",            icon: UserPlus },
          { href: "/marketing/sites",     label: "Sites Rastreados", icon: Globe },
        ],
      },
      {
        kind: "Inteligência Comercial" as SubSection["kind"],
        items: [
          { href: "/marketing/inteligencia-comercial",                 label: "Competidores",     icon: Target, exact: true },
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
          { href: "/compras/acompanhamento",     label: "Acompanhamento",        icon: Kanban },
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
          { href: "/financeiro/parcelamentos", label: "Parcelamentos", icon: Layers },
          { href: "/financeiro/encontro-de-contas", label: "Compensação Pagar/Receber", icon: ArrowLeftRight },
        ],
      },
      // "Outros": processos que ficam para o futuro — fora do fluxo do dia a dia.
      {
        kind: "Outros",
        items: [
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
          { href: "/contabilidade/integracao-dexion", label: "Integração Dexion", icon: Plug },
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
    id: "fiscal",
    label: "Fiscal",
    icon: Receipt,
    sections: [
      {
        kind: "Cadastros",
        items: [
          { href: "/fiscal/cadastros/configuracao",      label: "Configuração Fiscal",  icon: Settings2 },
          { href: "/fiscal/cadastros/series",            label: "Séries Fiscais",       icon: Hash },
          { href: "/fiscal/cadastros/grupos-tributacao", label: "Grupos de Tributação", icon: FolderTree },
          { href: "/fiscal/cadastros/operacoes",         label: "Operações Fiscais",    icon: FileText },
          { href: "/fiscal/cadastros/regras",            label: "Regras de Tributação", icon: Scale },
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
          { href: "/rh/horarios", label: "Horários de Trabalho", icon: CalendarDays },
        ],
      },
      {
        kind: "Processos",
        items: [
          { href: "/rh/folhas", label: "Folhas de Pagamento", icon: FileText },
          { href: "/rh/diaristas", label: "Diárias", icon: CalendarDays },
          { href: "/rh/diaristas/pagamentos", label: "Pagamento de Diárias", icon: Banknote },
        ],
      },
      {
        kind: "Relatórios",
        items: [
          { href: "/rh/relatorios", label: "Folha & Diárias", icon: BarChart3 },
        ],
      },
    ],
  },
  {
    id: "sst",
    label: "Saúde e Segurança",
    icon: ShieldCheck,
    sections: [
      {
        kind: "Geral",
        items: [
          { href: "/sst", label: "Painel de conformidade", icon: LayoutDashboard, exact: true },
          { href: "/sst/colaboradores", label: "Colaboradores", icon: UserCog },
        ],
      },
      {
        kind: "Processos",
        items: [
          { href: "/sst/epis", label: "EPIs e entregas", icon: HardHat },
          { href: "/sst/saude", label: "ASO e exames", icon: Stethoscope },
          { href: "/sst/agendamentos", label: "Agendamento de exames", icon: CalendarCheck },
          { href: "/sst/obrigacoes", label: "Obrigações (PGR, PCMSO…)", icon: FileCheck2 },
          { href: "/sst/treinamentos", label: "Treinamentos", icon: GraduationCap },
          { href: "/sst/maquinas", label: "Máquinas (NR-12)", icon: Cog },
          { href: "/sst/incidentes", label: "Incidentes e CAT", icon: Siren },
          { href: "/sst/inspecoes", label: "Inspeções", icon: ClipboardCheck },
          { href: "/sst/cipa", label: "CIPA", icon: Users2 },
        ],
      },
      {
        kind: "Relatórios",
        items: [
          { href: "/sst/indicadores", label: "Indicadores (TF/TG)", icon: BarChart3 },
          { href: "/sst/esocial", label: "Pré-eSocial (CAT/ASO)", icon: FileText },
        ],
      },
      {
        kind: "Configurações",
        items: [
          { href: "/sst/configuracoes", label: "Funções e requisitos", icon: Settings2 },
          { href: "/sst/medicos", label: "Médicos examinadores", icon: Stethoscope },
        ],
      },
    ],
  },
  {
    id: "contratos",
    label: "Contratos",
    icon: FileSignature,
    sections: [
      {
        kind: "Geral",
        items: [
          { href: "/contratos", label: "Painel", icon: LayoutDashboard, exact: true },
          { href: "/contratos/lista", label: "Contratos", icon: FileSignature },
        ],
      },
    ],
  },
  {
    id: "pcm",
    label: "Manutenção",
    icon: Wrench,
    sections: [
      {
        kind: "Cadastros" as SubSection["kind"],
        items: [
          { href: "/pcm/ativos",          label: "Ativos",           icon: Factory },
          { href: "/pcm/planos/cadastro", label: "Planos de Manut.", icon: CalendarClock },
          { href: "/pcm/configuracoes",   label: "Configurações",    icon: Settings2 },
        ],
      },
      {
        kind: "Processos" as SubSection["kind"],
        items: [
          { href: "/pcm",                 label: "Painel",           icon: LayoutDashboard, exact: true },
          { href: "/pcm/mapa",            label: "Mapa da planta",   icon: MapIcon },
          { href: "/pcm/solicitacoes",    label: "Solicitações",     icon: Inbox },
          { href: "/pcm/os",              label: "Ordens de Serviço", icon: Wrench },
          { href: "/pcm/quadro-os",       label: "Setor x OS",       icon: Kanban },
        ],
      },
      {
        kind: "Relatórios" as SubSection["kind"],
        items: [
          { href: "/pcm/relatorios",      label: "Custos e falhas",  icon: BarChart3 },
          { href: "/pcm/indicadores",     label: "Indicadores",      icon: Activity },
          { href: "/pcm/planos",          label: "Aderência dos planos", icon: CalendarCheck },
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
        kind: "Relatórios" as SubSection["kind"],
        items: [
          { href: "/pcp/relatorios/producao", label: "Produção", icon: TrendingUp },
        ],
      },
      {
        kind: "Outros" as SubSection["kind"],
        items: [
          { href: "/pcp/planejamento",     label: "Planejamento (MPS/MRP)", icon: Calculator },
        ],
      },
    ],
  },
  {
    id: "projetos",
    label: "Projetos",
    icon: FolderKanban,
    sections: [
      {
        kind: "Geral",
        items: [
          { href: "/projetos/caixa-de-entrada", label: "Caixa de Entrada", icon: Inbox },
          { href: "/projetos/minhas-tarefas", label: "Minhas Tarefas", icon: ListTodo },
          { href: "/projetos/agenda", label: "Agenda", icon: CalendarDays },
          { href: "/projetos/equipe", label: "Carga da equipe", icon: Users },
          { href: "/projetos", label: "Meus Projetos", icon: FolderKanban, exact: true },
        ],
      },
    ],
  },
  {
    id: "investimentos",
    label: "Investimentos",
    icon: LineChart,
    sections: [
      {
        kind: "Geral",
        items: [
          { href: "/investimentos", label: "Carteira B3", icon: LineChart },
        ],
      },
    ],
  },
  {
    id: "documentos",
    label: "Documentos",
    icon: FileArchive,
    sections: [
      {
        kind: "Geral",
        items: [
          { href: "/documentos", label: "Acervo", icon: FileArchive, exact: true },
          { href: "/documentos/vencimentos", label: "Vencimentos", icon: CalendarClock },
        ],
      },
    ],
  },
];

// Administração vive dentro de Configurações: a seção "Sistema" (admin) só é
// renderizada para quem tem acesso ao módulo admin (filtro no render).
export const configModule: Module = {
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

export const allModules = [...mainModules, configModule];
