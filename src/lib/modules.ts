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
      { key: "formas-pagamento",    label: "Formas de Pagamento", acoes: ["ver", "inserir", "editar", "excluir"] },
      // Financeiro
      { key: "centros-custo",       label: "Centros de Custo",    acoes: ["ver", "inserir", "editar", "excluir"] },
    ],
  },
  {
    key: "comercial",
    label: "Comercial",
    group: "Comercial",
    recursos: [
      { key: "pedidos-venda", label: "Pedidos de Venda", acoes: ["ver", "inserir", "editar", "excluir"] },
    ],
  },
  {
    key: "almoxarifado",
    label: "Almoxarifado",
    group: "Suprimentos",
    recursos: [
      { key: "estoque",       label: "Posição de Estoque", acoes: ["ver"] },
      { key: "movimentacoes", label: "Movimentações",      acoes: ["ver", "inserir"] },
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
      { key: "conferencias",  label: "Conferência de Compra",  acoes: ["ver", "inserir", "editar", "excluir"] },
    ],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    group: "Financeiro",
    recursos: [
      { key: "contas-bancarias", label: "Contas Bancárias", acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "bancos",           label: "Bancos",           acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "plano-contas",     label: "Plano de Contas",  acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "contas-receber",   label: "Contas a Receber", acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "contas-pagar",     label: "Contas a Pagar",   acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "agenda-financeira", label: "Agenda Financeira", acoes: ["ver", "editar"] },
      { key: "recorrencias",     label: "Recorrências",     acoes: ["ver", "inserir", "editar", "excluir"] },
      { key: "conciliacao-ofx",  label: "Conciliação (OFX)", acoes: ["ver", "inserir", "editar"] },
      { key: "fluxo-caixa",      label: "Fluxo de Caixa",   acoes: ["ver"] },
    ],
  },
  {
    key: "pcm",
    label: "PCM",
    group: "Manutenção",
    recursos: [
      { key: "dashboard", label: "Dashboard PCM", acoes: ["ver"] },
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
    ],
  },
  {
    key: "admin",
    label: "Administração",
    group: "Sistema",
    recursos: [
      { key: "usuarios", label: "Usuários", acoes: ["ver", "inserir", "editar", "excluir"] },
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
