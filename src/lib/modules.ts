export type Acao = "ver" | "inserir" | "editar" | "excluir";

export type RecursoDef = {
  key: string;
  label: string;
  acoes: Acao[];
};

export type ModuloDef = {
  key: string;
  label: string;
  group: string;
  recursos: RecursoDef[];
};

export const MODULOS: ModuloDef[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    group: "Geral",
    recursos: [
      { key: "dashboard", label: "Dashboard", acoes: ["ver"] },
    ],
  },
  {
    key: "empresa",
    label: "Empresa",
    group: "Empresa",
    recursos: [
      // Empresa
      { key: "filiais",             label: "Filiais",             acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "colaboradores",       label: "Colaboradores",       acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "setores",             label: "Setores",             acoes: ["ver", "inserir", "editar", "excluir"] },
      // Comercial
      { key: "clientes",            label: "Clientes",            acoes: ["ver", "inserir", "editar", "excluir"] },
      // Almoxarifado
      { key: "produtos",            label: "Produtos",            acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "tipos-produto",       label: "Tipos de Produto",    acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "unidades",            label: "Unidades de Medida",  acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "locais-estoque",      label: "Locais de Estoque",   acoes: ["ver", "inserir", "editar", "excluir"] },
      // Compras
      { key: "fornecedores",        label: "Fornecedores",        acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "condicoes-pagamento", label: "Cond. de Pagamento",  acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "tipos-operacao",      label: "Tipos de Op. (TES)",  acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "formas-pagamento",    label: "Formas de Pagamento", acoes: ["ver", "inserir", "editar", "excluir"] },
      // Financeiro
      { key: "centros-custo",       label: "Centros de Custo",    acoes: ["ver", "inserir", "editar", "excluir"] },
    ],
  },
  {
    key: "marketing",
    label: "Marketing",
    group: "Marketing",
    recursos: [
      { key: "painel",       label: "Painel de Marketing",        acoes: ["ver"] },
      { key: "concorrentes", label: "Competidores (IC)",          acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "geomarketing", label: "Geomarketing",               acoes: ["ver"] },
      { key: "funis",        label: "Funis de Marketing",         acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "campanhas",    label: "Campanhas",                  acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "leads",        label: "Leads",                      acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "sites",        label: "Sites Rastreados",           acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "precos-mercado", label: "Preço de Mercado (IC)",    acoes: ["ver"] },
    ],
  },
  {
    key: "comercial",
    label: "Faturamento",
    group: "Faturamento",
    recursos: [
      { key: "pedidos-venda",   label: "Pedidos de Venda",    acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "pdv",             label: "Caixa (PDV)",         acoes: ["ver", "inserir"] },
      { key: "minutas",         label: "Minutas",             acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "saldo-clientes",  label: "Saldos de Clientes",  acoes: ["ver"] },
      { key: "agenda-entregas", label: "Agenda de Entregas",  acoes: ["ver", "editar"] },
      { key: "comodato",        label: "Comodato",            acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "tabelas-preco",   label: "Tabelas de Preço",    acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "produtos-venda",  label: "Produtos para Venda", acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "vendedores",      label: "Vendedores",          acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "motoristas",      label: "Motoristas",          acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "relatorios",      label: "Relatórios de Faturamento", acoes: ["ver"] },
    ],
  },
  {
    key: "almoxarifado",
    label: "Almoxarifado",
    group: "Suprimentos",
    recursos: [
      { key: "estoque",             label: "Posição de Estoque",    acoes: ["ver"] },
      { key: "movimentacoes",       label: "Movimentações",         acoes: ["ver", "inserir"] },
      { key: "requisicoes",         label: "Req/Dev de Materiais",  acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "inventarios",         label: "Inventário",            acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "estoque-terceiros",   label: "Estoque de Terceiros",  acoes: ["ver"] },
      { key: "relatorios",          label: "Relatórios de Estoque", acoes: ["ver"] },
    ],
  },
  {
    key: "compras",
    label: "Compras",
    group: "Suprimentos",
    recursos: [
      { key: "solicitacoes",  label: "Solicitação de Compras", acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "cotacoes",      label: "Cotação de Compras",     acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "pedidos-compra", label: "Pedido de Compras",     acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "conferencias",  label: "Documento de Entrada",   acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "aprovacoes",    label: "Aprovações",             acoes: ["ver", "editar"] },
      { key: "relatorios",    label: "Relatórios (SPEND/SLA/OTD)", acoes: ["ver"] },
    ],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    group: "Financeiro",
    recursos: [
      { key: "contas-bancarias", label: "Contas Bancárias", acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "bancos",           label: "Bancos",           acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "contas-receber",   label: "Contas a Receber", acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "contas-pagar",     label: "Contas a Pagar",   acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "agenda-financeira", label: "Agenda Financeira", acoes: ["ver", "editar"] },
      { key: "recorrencias",     label: "Recorrências",     acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "conciliacao-ofx",  label: "Conciliação (OFX)", acoes: ["ver", "inserir", "editar"] },
      { key: "fluxo-caixa",      label: "Fluxo de Caixa",   acoes: ["ver"] },
      { key: "cartoes",          label: "Cartões (Maquinetas)", acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "naturezas",        label: "Naturezas Financeiras", acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "encontro-contas",  label: "Encontro de Contas", acoes: ["ver", "inserir", "editar", "excluir"] },
    ],
  },
  {
    key: "contabilidade",
    label: "Contabilidade",
    group: "Contabilidade",
    recursos: [
      { key: "plano-contas", label: "Plano de Contas Contábil", acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "lancamentos",  label: "Diário Contábil",          acoes: ["ver", "inserir"] },
      { key: "custeio",      label: "Custeio (CIF/MOD)",        acoes: ["ver", "editar"] },
      { key: "razao",        label: "Razão",                    acoes: ["ver"] },
      { key: "balancete",    label: "Balancete",                acoes: ["ver"] },
      { key: "dre",          label: "DRE",                      acoes: ["ver"] },
      { key: "balanco",      label: "Balanço Patrimonial",      acoes: ["ver"] },
      { key: "imobilizado",  label: "Imobilizado",              acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "cpv",          label: "CPV",                      acoes: ["ver"] },
      { key: "fechamento",   label: "Encerramento do Exercício", acoes: ["ver", "editar"] },
      { key: "diagnostico",  label: "Diagnóstico",              acoes: ["ver"] },
    ],
  },
  {
    // Módulo Fiscal — camada oficial de prestação de contas, ISOLADA dos
    // módulos gerenciais (docs/fiscal-prd.md): NF não movimenta estoque,
    // financeiro nem contabilidade; vínculos com pedidos são manuais.
    key: "fiscal",
    label: "Fiscal",
    group: "Fiscal",
    recursos: [
      { key: "configuracao",      label: "Configuração Fiscal",   acoes: ["ver", "editar"] },
      { key: "series",            label: "Séries Fiscais",        acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "grupos-tributacao", label: "Grupos de Tributação",  acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "operacoes",         label: "Operações Fiscais",     acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "regras",            label: "Regras de Tributação",  acoes: ["ver", "inserir", "editar", "excluir"] },
      // F1/F2 (emissor e consultores) — permissões já previstas
      { key: "emissao",           label: "Emissão de NF",         acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "saida",             label: "Consultor de Saída",    acoes: ["ver", "editar"] },
      { key: "entrada",           label: "Consultor de Entrada",  acoes: ["ver", "editar"] },
    ],
  },
  {
    key: "pcm",
    label: "PCM",
    group: "Manutenção",
    recursos: [
      { key: "dashboard",   label: "Dashboard PCM",       acoes: ["ver"] },
      { key: "ativos",      label: "Ativos",              acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "ordens",      label: "Ordens de Serviço",   acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "planos",      label: "Planos de Manutenção", acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "ativo-saude", label: "Ativo Saúde (MTBF/MTTR)", acoes: ["ver", "editar"] },
    ],
  },
  {
    key: "pcp",
    label: "PCP",
    group: "Produção",
    recursos: [
      { key: "dashboard",        label: "Dashboard do PCP",      acoes: ["ver"] },
      { key: "ordens",           label: "Ordens de Produção",   acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "operacoes",        label: "Operações (fila)",      acoes: ["ver", "editar"] },
      { key: "planejamento",     label: "Planejamento (MPS/MRP)", acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "sequenciamento",   label: "Sequenciamento (forno)", acoes: ["ver"] },
      { key: "ajuda",            label: "Como usar o PCP",       acoes: ["ver"] },
      { key: "engenharia",       label: "Engenharia do Produto", acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "fluxos",           label: "Fluxos de Produção",   acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "centros-trabalho", label: "Centros de Trabalho",  acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "chao",             label: "Chão de Fábrica",      acoes: ["ver", "editar"] },
      { key: "estados-wip",      label: "Estados de WIP",       acoes: ["ver", "inserir", "editar", "excluir"] },
    ],
  },
  {
    key: "rh",
    label: "Gestão de Pessoas",
    group: "RH",
    recursos: [
      { key: "folhas", label: "Folhas de Pagamento", acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "diaristas", label: "Diárias", acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "horarios", label: "Horários de Trabalho", acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "relatorios", label: "Relatórios (Folha & Diárias)", acoes: ["ver"] },
    ],
  },
  {
    key: "admin",
    label: "Administração",
    group: "Sistema",
    recursos: [
      { key: "usuarios", label: "Usuários", acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "perfis",   label: "Perfis de Acesso", acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "lixeira",  label: "Lixeira de Documentos", acoes: ["ver", "editar"] },
    ],
  },
];

export const MODULO_GROUPS = Array.from(new Set(MODULOS.map((m) => m.group)));

/** Todas as permissões de um módulo: "comercial.clientes.ver", etc. */
export function getModuloPermissoes(modKey: string): string[] {
  const mod = MODULOS.find((m) => m.key === modKey);
  if (!mod) return [];
  return mod.recursos.flatMap((r) => r.acoes.map((a) => `${modKey}.${r.key}.${a}`));
}

/** Todas as permissões do sistema */
export function getAllPermissoes(): string[] {
  return MODULOS.flatMap((m) => getModuloPermissoes(m.key));
}

/** Label amigável para uma chave de permissão "modulo.recurso.acao" */
export function getPermissaoLabel(perm: string): string {
  const [modKey, recursoKey, acao] = perm.split(".");
  const mod = MODULOS.find((m) => m.key === modKey);
  if (!mod) return perm;
  const recurso = mod.recursos.find((r) => r.key === recursoKey);
  if (!recurso) return perm;
  const acaoLabel: Record<string, string> = { ver: "Ver", inserir: "Inserir", editar: "Editar", excluir: "Excluir" };
  return `${mod.label} → ${recurso.label} → ${acaoLabel[acao] ?? acao}`;
}
