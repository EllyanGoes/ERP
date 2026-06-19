// Conteúdo da Central de Documentação: processos do sistema em estilo BPMN.
// Cada módulo tem um resumo, as telas relacionadas e os processos (texto +
// diagrama). Os diagramas são autorados a partir dos fluxos reais já
// implementados (venda balcão/agendada, venda à ordem, cotação→aprovação CT→PC,
// requisição de materiais, recebimento/baixa financeira).
import type { LucideIcon } from "lucide-react";
import { Network, ShoppingCart, Boxes, ClipboardList, Wallet, Factory, Wrench, Calculator } from "lucide-react";
import type { BpmnGrafo } from "@/components/documentacao/ProcessoDiagram";

export type Tela = { label: string; href: string; descricao: string };
export type Processo = { titulo: string; texto: string; grafo: BpmnGrafo; detalhes?: string[] };
export type ModuloDoc = {
  id: string; label: string; icon: LucideIcon; resumo: string;
  telas: Tela[]; processos: Processo[];
};

// ── Visão geral (macro) ───────────────────────────────────────────────────────
const macro: BpmnGrafo = {
  nodes: [
    { id: "vi", tipo: "inicio", x: 0,    y: 40,  label: "Cliente compra" },
    { id: "pv", tipo: "tarefa", x: 110,  y: 24,  label: "Pedido de Venda", cor: "azul" },
    { id: "ge", tipo: "gateway",x: 340,  y: 28,  label: "Como entrega?" },
    { id: "bal",tipo: "tarefa", x: 470,  y: -30, label: "Balcão (Caixa)", sub: "recebe + baixa estoque", cor: "azul" },
    { id: "agd",tipo: "tarefa", x: 470,  y: 96,  label: "Agendada", sub: "minutas → entrega", cor: "azul" },
    { id: "cr", tipo: "tarefa", x: 720,  y: 24,  label: "Contas a Receber", cor: "verde" },
    { id: "vf", tipo: "fim",    x: 940,  y: 40,  label: "Venda concluída" },

    { id: "ci", tipo: "inicio", x: 0,    y: 320, label: "Falta material" },
    { id: "sc", tipo: "tarefa", x: 110,  y: 304, label: "Necessidade (SC)", cor: "ambar" },
    { id: "ct", tipo: "tarefa", x: 300,  y: 304, label: "Cotação", cor: "ambar" },
    { id: "ap", tipo: "tarefa", x: 480,  y: 304, label: "Aprovação CT→PC", sub: "Web ou Telegram", cor: "ambar" },
    { id: "pc", tipo: "tarefa", x: 660,  y: 304, label: "Pedido de Compra", cor: "ambar" },
    { id: "cf", tipo: "tarefa", x: 840,  y: 304, label: "Conferência / Entrada", cor: "ambar" },
    { id: "est",tipo: "tarefa", x: 1040, y: 250, label: "Estoque", sub: "abastece as vendas", cor: "cinza" },
    { id: "cp", tipo: "tarefa", x: 1040, y: 360, label: "Contas a Pagar", cor: "verde" },
  ],
  edges: [
    { from: "vi", to: "pv" }, { from: "pv", to: "ge" },
    { from: "ge", to: "bal", label: "Balcão" }, { from: "ge", to: "agd", label: "Agendada" },
    { from: "bal", to: "cr" }, { from: "agd", to: "cr" }, { from: "cr", to: "vf" },
    { from: "ci", to: "sc" }, { from: "sc", to: "ct" }, { from: "ct", to: "ap" },
    { from: "ap", to: "pc" }, { from: "pc", to: "cf" },
    { from: "cf", to: "est" }, { from: "cf", to: "cp" },
    { from: "est", to: "bal", label: "abastece" },
  ],
};

// ── Faturamento ───────────────────────────────────────────────────────────────
const faturamentoFluxo: BpmnGrafo = {
  nodes: [
    { id: "a", tipo: "inicio", x: 0,   y: 60, label: "Novo pedido" },
    { id: "b", tipo: "tarefa", x: 110, y: 44, label: "Lançar itens", sub: "cliente, preços, desconto", cor: "azul" },
    { id: "g", tipo: "gateway",x: 320, y: 48, label: "Modalidade" },
    { id: "c", tipo: "tarefa", x: 450, y: -30,label: "Caixa (PDV)", sub: "recebe pagamento", cor: "azul" },
    { id: "d", tipo: "tarefa", x: 660, y: -30,label: "Baixa de estoque", sub: "minuta de retirada", cor: "ambar" },
    { id: "e", tipo: "tarefa", x: 450, y: 110,label: "Confirmar", sub: "gera conta a receber", cor: "azul" },
    { id: "f", tipo: "tarefa", x: 660, y: 110,label: "Minutas / Entrega", sub: "baixa no envio", cor: "ambar" },
    { id: "h", tipo: "tarefa", x: 880, y: 40, label: "Conta a Receber", cor: "verde" },
    { id: "z", tipo: "fim",    x: 1080,y: 56, label: "Concluído" },
  ],
  edges: [
    { from: "a", to: "b" }, { from: "b", to: "g" },
    { from: "g", to: "c", label: "Balcão" }, { from: "c", to: "d" }, { from: "d", to: "h" },
    { from: "g", to: "e", label: "Agendada" }, { from: "e", to: "f" }, { from: "f", to: "h" },
    { from: "h", to: "z" },
  ],
};

// ── Estoque ───────────────────────────────────────────────────────────────────
const requisicaoFluxo: BpmnGrafo = {
  nodes: [
    { id: "a", tipo: "inicio", x: 0,   y: 40, label: "Setor precisa de material" },
    { id: "b", tipo: "tarefa", x: 140, y: 24, label: "Requisição de Materiais", sub: "itens + local", cor: "ambar" },
    { id: "c", tipo: "tarefa", x: 360, y: 24, label: "Atender", sub: "marcar como atendida", cor: "ambar" },
    { id: "g", tipo: "gateway",x: 560, y: 28, label: "Tem saldo?" },
    { id: "d", tipo: "tarefa", x: 690, y: -30,label: "Baixa de estoque (SAÍDA)", sub: "movimentação", cor: "cinza" },
    { id: "e", tipo: "nota",   x: 690, y: 110,label: "Avisa saldo negativo (não trava)" },
    { id: "z", tipo: "fim",    x: 940, y: 40, label: "Estoque atualizado" },
  ],
  edges: [
    { from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "g" },
    { from: "g", to: "d", label: "sim" }, { from: "g", to: "e", label: "não" },
    { from: "d", to: "z" },
  ],
};

// ── Compras ───────────────────────────────────────────────────────────────────
const comprasFluxo: BpmnGrafo = {
  nodes: [
    { id: "a", tipo: "inicio", x: 0,   y: 40, label: "Necessidade de compra" },
    { id: "b", tipo: "tarefa", x: 130, y: 24, label: "Cotação", sub: "fornecedores respondem", cor: "ambar" },
    { id: "c", tipo: "tarefa", x: 330, y: 24, label: "Enviar p/ aprovação", sub: "escolhe vencedor", cor: "ambar" },
    { id: "g", tipo: "gateway",x: 540, y: 28, label: "Aprovado?" },
    { id: "d", tipo: "tarefa", x: 670, y: -30,label: "Pedido de Compra", sub: "gerado na aprovação", cor: "ambar" },
    { id: "r", tipo: "fim",    x: 670, y: 120,label: "Reprovado" },
    { id: "e", tipo: "tarefa", x: 880, y: -30,label: "Conferência (entrada)", cor: "ambar" },
    { id: "f1",tipo: "tarefa", x: 1090,y: -70,label: "Estoque (ENTRADA)", cor: "cinza" },
    { id: "f2",tipo: "tarefa", x: 1090,y: 40, label: "Contas a Pagar", cor: "verde" },
  ],
  edges: [
    { from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "g" },
    { from: "g", to: "d", label: "sim (Web/Telegram)" }, { from: "g", to: "r", label: "não" },
    { from: "d", to: "e" }, { from: "e", to: "f1" }, { from: "e", to: "f2" },
  ],
};

// ── Financeiro ────────────────────────────────────────────────────────────────
const financeiroFluxo: BpmnGrafo = {
  nodes: [
    { id: "a", tipo: "inicio", x: 0,   y: 40, label: "Título gerado", sub: "venda / compra" },
    { id: "b", tipo: "tarefa", x: 150, y: 24, label: "Conta a Receber / Pagar", sub: "em aberto", cor: "verde" },
    { id: "c", tipo: "tarefa", x: 380, y: 24, label: "Baixar", sub: "forma + conta de destino", cor: "verde" },
    { id: "g", tipo: "gateway",x: 590, y: 28, label: "Forma eletrônica?" },
    { id: "n", tipo: "nota",   x: 700, y: -40,label: "Pix/cartão não cai no Caixa em Dinheiro" },
    { id: "d", tipo: "tarefa", x: 720, y: 90, label: "Lançamento na conta", sub: "Caixa ou Banco", cor: "verde" },
    { id: "z", tipo: "fim",    x: 940, y: 56, label: "Liquidado" },
  ],
  edges: [
    { from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "g" },
    { from: "g", to: "n", label: "sim → banco" }, { from: "g", to: "d", label: "dinheiro → caixa" },
    { from: "d", to: "z" },
  ],
};

// ── Produção (PCP) ────────────────────────────────────────────────────────────
const pcpPreparacaoFluxo: BpmnGrafo = {
  nodes: [
    { id: "a", tipo: "inicio", x: 0,   y: 40, label: "Montar a fábrica" },
    { id: "b", tipo: "tarefa", x: 140, y: 24, label: "Centros de Trabalho", sub: "forno, prensa, secador", cor: "violeta" },
    { id: "c", tipo: "tarefa", x: 360, y: 24, label: "Fluxo de Produção", sub: "desenhar e publicar", cor: "violeta" },
    { id: "d", tipo: "tarefa", x: 580, y: 24, label: "Engenharia (BOM)", sub: "fluxo + insumos do produto", cor: "violeta" },
    { id: "z", tipo: "fim",    x: 800, y: 40, label: "Pronto p/ planejar" },
  ],
  edges: [
    { from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "d" }, { from: "d", to: "z" },
  ],
};

const pcpExecucaoFluxo: BpmnGrafo = {
  nodes: [
    { id: "a", tipo: "inicio", x: 0,    y: 40, label: "Demanda (MPS)" },
    { id: "b", tipo: "tarefa", x: 130,  y: 24, label: "Planejamento (MRP)", sub: "explode a estrutura, aponta o que comprar", cor: "cinza" },
    { id: "c", tipo: "tarefa", x: 360,  y: 24, label: "Ordem de Produção", sub: "abre do fluxo publicado", cor: "violeta" },
    { id: "g", tipo: "gateway",x: 570,  y: 28, label: "Liberada?" },
    { id: "r", tipo: "nota",   x: 690,  y: 110,label: "Rascunho aguarda liberação" },
    { id: "d", tipo: "tarefa", x: 700,  y: -34,label: "Operações (fila)", sub: "apontamento por etapa", cor: "violeta" },
    { id: "e", tipo: "tarefa", x: 910,  y: -34,label: "Sequenciamento (forno)", sub: "programa o gargalo", cor: "violeta" },
    { id: "z", tipo: "fim",    x: 1120, y: 0,  label: "Produto acabado → estoque" },
  ],
  edges: [
    { from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "g" },
    { from: "g", to: "d", label: "sim" }, { from: "g", to: "r", label: "não" },
    { from: "d", to: "e" }, { from: "e", to: "z" },
  ],
};

// ── Manutenção (PCM) ──────────────────────────────────────────────────────────
const pcmFluxo: BpmnGrafo = {
  nodes: [
    { id: "a",  tipo: "inicio", x: 0,    y: -20, label: "Plano de manutenção" },
    { id: "b",  tipo: "tarefa", x: 140,  y: -36, label: "Gera O.S. preventiva", sub: "por periodicidade / uso", cor: "rosa" },
    { id: "ci", tipo: "inicio", x: 0,    y: 150, label: "Falha do ativo" },
    { id: "bc", tipo: "tarefa", x: 140,  y: 134, label: "Abre O.S. corretiva", cor: "rosa" },
    { id: "m",  tipo: "tarefa", x: 370,  y: 48,  label: "Quadro de O.S.", sub: "programar e atribuir", cor: "rosa" },
    { id: "ex", tipo: "tarefa", x: 590,  y: 48,  label: "Executar + apontar", sub: "tempos, peças, parada", cor: "rosa" },
    { id: "g",  tipo: "gateway",x: 800,  y: 52,  label: "Concluída?" },
    { id: "z",  tipo: "tarefa", x: 930,  y: -10, label: "Indicadores MTBF/MTTR", sub: "saúde do ativo", cor: "cinza" },
    { id: "bk", tipo: "nota",   x: 930,  y: 130, label: "Reabre se voltar a falhar" },
    { id: "f",  tipo: "fim",    x: 1150, y: 16,  label: "Ativo disponível" },
  ],
  edges: [
    { from: "a", to: "b" }, { from: "b", to: "m" },
    { from: "ci", to: "bc" }, { from: "bc", to: "m" },
    { from: "m", to: "ex" }, { from: "ex", to: "g" },
    { from: "g", to: "z", label: "sim" }, { from: "g", to: "bk", label: "não" },
    { from: "z", to: "f" },
  ],
};

// ── Contabilidade ─────────────────────────────────────────────────────────────
const contabilidadeFluxo: BpmnGrafo = {
  nodes: [
    { id: "a", tipo: "inicio", x: 0,    y: 40, label: "Fato contábil", sub: "venda, compra, pagamento" },
    { id: "b", tipo: "tarefa", x: 160,  y: 24, label: "Lançamento (Diário)", sub: "partida dobrada: débito = crédito", cor: "verde" },
    { id: "p", tipo: "nota",   x: 180,  y: 130,label: "Classificado pelo Plano de Contas" },
    { id: "c", tipo: "tarefa", x: 400,  y: 24, label: "Razão", sub: "movimento por conta", cor: "verde" },
    { id: "d", tipo: "tarefa", x: 600,  y: 24, label: "Balancete", sub: "saldos conferidos", cor: "verde" },
    { id: "g", tipo: "gateway",x: 800,  y: 28, label: "Natureza da conta" },
    { id: "r1",tipo: "tarefa", x: 930,  y: -34,label: "DRE", sub: "contas de resultado", cor: "verde" },
    { id: "r2",tipo: "tarefa", x: 930,  y: 90, label: "Balanço Patrimonial", sub: "ativo, passivo e PL", cor: "verde" },
    { id: "z", tipo: "fim",    x: 1150, y: 20, label: "Demonstrações" },
  ],
  edges: [
    { from: "a", to: "b" }, { from: "b", to: "p", label: "classifica" },
    { from: "b", to: "c" }, { from: "c", to: "d" }, { from: "d", to: "g" },
    { from: "g", to: "r1", label: "resultado" }, { from: "g", to: "r2", label: "patrimonial" },
    { from: "r1", to: "z" }, { from: "r2", to: "z" },
  ],
};

// ── Naturezas financeiras → Contabilidade ─────────────────────────────────────
const naturezaContabilFluxo: BpmnGrafo = {
  nodes: [
    { id: "a",  tipo: "inicio", x: 0,    y: 70,  label: "Entrada/saída de dinheiro" },
    { id: "b",  tipo: "tarefa", x: 140,  y: 54,  label: "Classificar com a Natureza", sub: "no título ou pedido", cor: "verde" },
    { id: "n",  tipo: "nota",   x: 150,  y: 160, label: "A natureza traz 2 contas: Resultado (DRE) + Contrapartida (Balanço)" },
    { id: "g",  tipo: "gateway",x: 380,  y: 58,  label: "Tipo da natureza" },
    { id: "e1", tipo: "tarefa", x: 500,  y: -40, label: "Provisão (entrada)", sub: "D Ativo a receber / C Receita", cor: "verde" },
    { id: "e2", tipo: "tarefa", x: 720,  y: -40, label: "Recebimento", sub: "D Caixa/Banco / C Ativo", cor: "verde" },
    { id: "s1", tipo: "tarefa", x: 500,  y: 130, label: "Provisão (saída)", sub: "D Despesa / C Passivo a pagar", cor: "verde" },
    { id: "s2", tipo: "tarefa", x: 720,  y: 130, label: "Pagamento", sub: "D Passivo / C Caixa/Banco", cor: "verde" },
    { id: "z",  tipo: "tarefa", x: 940,  y: 46,  label: "DRE + Balanço", sub: "lançamento automático", cor: "verde" },
    { id: "f",  tipo: "fim",    x: 1150, y: 62,  label: "Contabilizado" },
  ],
  edges: [
    { from: "a", to: "b" }, { from: "b", to: "n", label: "regra" }, { from: "b", to: "g" },
    { from: "g", to: "e1", label: "Entrada" }, { from: "e1", to: "e2" }, { from: "e2", to: "z" },
    { from: "g", to: "s1", label: "Saída" }, { from: "s1", to: "s2" }, { from: "s2", to: "z" },
    { from: "z", to: "f" },
  ],
};

export const MODULOS: ModuloDoc[] = [
  {
    id: "visao-geral", label: "Visão geral", icon: Network,
    resumo: "Como os módulos se conectam de ponta a ponta. A Venda gera Contas a Receber e baixa o Estoque; as Compras (Necessidade → Cotação → Aprovação CT→PC → Pedido) abastecem o Estoque e geram Contas a Pagar. O Estoque é o elo entre vender e comprar; o Financeiro consolida o que entra e o que sai.",
    telas: [],
    processos: [{
      titulo: "Macro processo do grupo",
      texto: "Dois grandes fluxos se encontram no Estoque e no Financeiro: o de Venda (azul) e o de Suprimentos/Compras (âmbar). Toda venda vira recebimento (verde) e consome estoque; toda compra aprovada vira entrada de estoque + pagamento (verde).",
      grafo: macro,
    }],
  },
  {
    id: "faturamento", label: "Faturamento", icon: ShoppingCart,
    resumo: "Pedidos de venda do início ao fim. Duas modalidades: Balcão (retirada na hora, o Caixa recebe e baixa o estoque numa ação) e Agendada (confirma, entrega via minutas e a conta a receber nasce na entrega). Vendas à ordem deixam o estoque sair de outra empresa do grupo.",
    telas: [
      { label: "Pedidos de Venda", href: "/pedidos-venda", descricao: "Criar, editar e acompanhar os pedidos." },
      { label: "Caixa (PDV)", href: "/pdv", descricao: "Receber pagamento e concluir vendas de balcão." },
      { label: "Minutas", href: "/comercial/minutas", descricao: "Entrega das vendas agendadas (baixa de estoque)." },
    ],
    processos: [{
      titulo: "Da venda à conclusão",
      texto: "O vendedor lança itens, cliente, preços e descontos. Em Balcão, o Caixa recebe o pagamento e o sistema baixa o estoque e fecha a venda. Em Agendada, confirma-se o pedido e a entrega é feita por minutas — a conta a receber é gerada conforme o recebimento. O cartão de crédito parcelado fica como Conta a Receber em aberto até a baixa.",
      grafo: faturamentoFluxo,
    }],
  },
  {
    id: "estoque", label: "Estoque", icon: Boxes,
    resumo: "Saldos por local e por empresa. As saídas vêm de requisições de materiais (almoxarifado) e das vendas; as entradas vêm das conferências de compra. O sistema avisa quando uma saída deixa o saldo negativo, sem travar o atendimento.",
    telas: [
      { label: "Requisições de Materiais", href: "/suprimentos/requisicoes-materiais", descricao: "Pedir e atender materiais do almoxarifado." },
      { label: "Movimentações", href: "/suprimentos/movimentacoes", descricao: "Entradas e saídas avulsas; estoque de terceiros." },
      { label: "Locais de Estoque", href: "/suprimentos/locais-estoque", descricao: "Cadastro dos locais e categorias aceitas." },
    ],
    processos: [{
      titulo: "Requisição de materiais",
      texto: "O setor requisita os itens. Ao marcar a requisição como Atendida, o sistema baixa o estoque (movimentação de SAÍDA) no local indicado. Se faltar saldo, mostra um aviso de saldo negativo, mas permite seguir — o estoque pode ficar negativo e ser acertado depois.",
      grafo: requisicaoFluxo,
    }],
  },
  {
    id: "compras", label: "Compras", icon: ClipboardList,
    resumo: "Do pedido de compra à entrada no estoque. A partir de uma necessidade, abre-se a cotação; o comprador escolhe o vencedor e envia para aprovação (CT→PC). O aprovador decide pela Web ou pelo Telegram; aprovado, o Pedido de Compra é gerado, conferido e dá entrada no estoque + contas a pagar.",
    telas: [
      { label: "Solicitações de Compra", href: "/compras/necessidades", descricao: "Necessidades de compra (SC)." },
      { label: "Cotações", href: "/suprimentos/cotacoes", descricao: "Comparar fornecedores e enviar para aprovação." },
      { label: "Aprovações", href: "/aprovacoes", descricao: "Aprovar/reprovar cotações e solicitações." },
      { label: "Pedidos de Compra", href: "/suprimentos/pedidos-compra", descricao: "Pedidos gerados e conferência de entrada." },
    ],
    processos: [{
      titulo: "Cotação → aprovação → entrada",
      texto: "A cotação recebe as respostas dos fornecedores. O comprador formaliza o vencedor e envia para aprovação — o aprovador recebe um resumo (com PDF no Telegram) e aprova ou reprova. Aprovado, o Pedido de Compra é gerado; a conferência registra a entrada no estoque e o título a pagar.",
      grafo: comprasFluxo,
    }],
  },
  {
    id: "financeiro", label: "Financeiro", icon: Wallet,
    resumo: "Contas a Receber, Contas a Pagar e Caixa. Cada título mostra a conta de contrapartida (onde o dinheiro caiu/sairá) e pode ser filtrado por conta. Uma trava impede que formas eletrônicas (Pix/cartão) sejam lançadas no Caixa em Dinheiro quando há banco cadastrado. As Naturezas Financeiras classificam cada movimento e fazem a ponte automática com a Contabilidade.",
    telas: [
      { label: "Contas a Receber", href: "/contas-receber", descricao: "Receber títulos; coluna e filtro por conta." },
      { label: "Contas a Pagar", href: "/contas-pagar", descricao: "Pagar títulos; conta de contrapartida." },
      { label: "Contas / Caixa", href: "/financeiro/contas", descricao: "Saldos e extrato por conta bancária/caixa." },
      { label: "Naturezas Financeiras", href: "/financeiro/naturezas", descricao: "Classificação dos movimentos e vínculo com o contábil." },
    ],
    processos: [
      {
        titulo: "Recebimento e baixa",
        texto: "Vendas e compras geram títulos (a receber/a pagar). Ao baixar, escolhe-se a forma e a conta de destino: dinheiro vai para o Caixa; formas eletrônicas (Pix, cartão) caem na conta bancária — a trava impede o eletrônico de cair no Caixa em Dinheiro. O lançamento move o saldo da conta.",
        grafo: financeiroFluxo,
      },
      {
        titulo: "Naturezas financeiras e o contábil",
        texto: "A Natureza Financeira é a ponte entre o gerencial (de onde o dinheiro entra/sai, fluxo de caixa) e o contábil (plano de contas, DRE e Balanço). Ao classificar um título com uma natureza, o sistema sabe automaticamente em quais contas contábeis lançar — sem ninguém digitar débito/crédito à mão. Por isso, escolher a natureza certa define de uma vez o relatório gerencial e a contabilidade.",
        grafo: naturezaContabilFluxo,
        detalhes: [
          "Toda natureza tem tipo (Entrada/Saída) e grupo (Receita, Custo, Despesa, Investimento, Financiamento). No cadastro dela ficam duas contas contábeis obrigatórias.",
          "Conta de RESULTADO (vai para a DRE): Receita para entradas; Despesa/Custo para saídas.",
          "Conta de CONTRAPARTIDA patrimonial (vai para o Balanço): Ativo a receber para entradas; Passivo a pagar para saídas.",
          "Entrada — ao gerar o título: D Ativo a receber / C Receita. No recebimento: D Caixa/Banco / C Ativo a receber.",
          "Saída — ao gerar o título: D Despesa/Custo / C Passivo a pagar. No pagamento: D Passivo a pagar / C Caixa/Banco.",
          "O Caixa/Banco usa sempre a conta real de cada baixa (a conta onde o dinheiro de fato entrou ou saiu).",
          "Vendas de pedido: o “a receber” nasce na confirmação e a receita na entrega — o título não duplica isso.",
          "Intragrupo (ex.: venda à ordem Cimento↔Tramontin) nunca lança caixa automático — é acerto por fora.",
          "Recado ao financeiro: classificação errada da natureza = DRE e Balanço errados. A natureza é o tradutor entre a linguagem do financeiro e a do contador.",
        ],
      },
    ],
  },
  {
    id: "producao", label: "Produção (PCP)", icon: Factory,
    resumo: "Planejamento e controle da produção. Primeiro monta-se a fábrica (Centros de Trabalho → Fluxo de Produção → Engenharia/BOM por produto); depois a demanda (MPS) roda o MRP, que abre Ordens de Produção. Liberada a ordem, o chão aponta as etapas na fila de Operações e o forno (gargalo) é programado no Sequenciamento. O produto acabado entra no estoque.",
    telas: [
      { label: "Centros de Trabalho", href: "/pcp/centros-trabalho", descricao: "Recursos da fábrica: forno, prensa, secador." },
      { label: "Fluxos de Produção", href: "/pcp/fluxos", descricao: "Desenhar e publicar o caminho da produção." },
      { label: "Engenharia do Produto", href: "/pcp/engenharia", descricao: "Fluxo + insumos (BOM) de cada produto." },
      { label: "Planejamento (MPS/MRP)", href: "/pcp/planejamento", descricao: "Demanda e explosão de necessidades." },
      { label: "Ordens de Produção", href: "/pcp/ordens", descricao: "Abrir, liberar e acompanhar ordens." },
      { label: "Operações (fila)", href: "/pcp/operacoes", descricao: "Apontamento das etapas pelo chão de fábrica." },
    ],
    processos: [
      {
        titulo: "Preparação: do recurso ao produto",
        texto: "Antes de produzir, cadastra-se a estrutura: os Centros de Trabalho (recursos), o Fluxo de Produção (o caminho pela fábrica, que é publicado) e a Engenharia de cada produto, que liga o produto ao fluxo e lista os insumos com quantidades (BOM). Um mesmo fluxo serve a vários produtos.",
        grafo: pcpPreparacaoFluxo,
      },
      {
        titulo: "Do planejamento ao produto acabado",
        texto: "A demanda (MPS) alimenta o MRP, que explode a estrutura e aponta o que falta comprar, abrindo as Ordens de Produção. Liberada a ordem, suas etapas entram na fila de Operações para apontamento (produção, perda, biomassa). O forno — gargalo — é programado no Sequenciamento. Ao concluir, o produto acabado dá entrada no estoque.",
        grafo: pcpExecucaoFluxo,
      },
    ],
  },
  {
    id: "manutencao", label: "Manutenção (PCM)", icon: Wrench,
    resumo: "Planejamento e controle da manutenção dos ativos. A manutenção preventiva nasce dos Planos (periodicidade ou uso) que geram Ordens de Serviço; a corretiva nasce de uma falha do ativo. As O.S. são programadas no Quadro, executadas com apontamento (tempos e peças) e, ao concluir, alimentam os indicadores de confiabilidade (MTBF/MTTR) e a saúde do ativo.",
    telas: [
      { label: "Ativos", href: "/pcm/ativos", descricao: "Cadastro dos equipamentos e sua criticidade." },
      { label: "Planos de Manutenção", href: "/pcm/planos", descricao: "Preventivas por periodicidade ou uso." },
      { label: "Quadro de O.S.", href: "/pcm/quadro-os", descricao: "Programar, atribuir e executar ordens de serviço." },
      { label: "MTBF / MTTR", href: "/pcm/ativo-saude", descricao: "Confiabilidade e saúde dos ativos." },
    ],
    processos: [{
      titulo: "Preventiva e corretiva",
      texto: "Dois gatilhos abrem uma Ordem de Serviço: o plano de manutenção (preventiva, no vencimento da periodicidade/uso) ou uma falha do ativo (corretiva). As O.S. entram no Quadro para programação e atribuição; o executante aponta tempos, peças e a parada. Concluída, a O.S. atualiza os indicadores MTBF/MTTR e a saúde do ativo — se a falha voltar, uma nova O.S. é aberta.",
      grafo: pcmFluxo,
    }],
  },
  {
    id: "contabilidade", label: "Contabilidade", icon: Calculator,
    resumo: "Escrituração pela partida dobrada. Cada fato contábil (venda, compra, pagamento) vira um lançamento no Diário, sempre com débito igual ao crédito, classificado pelo Plano de Contas. O Razão acumula o movimento por conta; o Balancete confere os saldos; e as demonstrações fecham o período: DRE (contas de resultado) e Balanço Patrimonial (ativo, passivo e PL). O Imobilizado controla os bens e sua depreciação.",
    telas: [
      { label: "Plano de Contas", href: "/contabilidade/plano-contas", descricao: "Contas contábeis (Ativo/Passivo/PL/Resultado)." },
      { label: "Diário Contábil", href: "/contabilidade/lancamentos", descricao: "Lançamentos por partida dobrada." },
      { label: "Razão", href: "/contabilidade/razao", descricao: "Movimento e saldo conta a conta." },
      { label: "Balancete", href: "/contabilidade/balancete", descricao: "Conferência dos saldos do período." },
      { label: "DRE", href: "/contabilidade/dre", descricao: "Demonstração do resultado." },
      { label: "Balanço Patrimonial", href: "/contabilidade/balanco", descricao: "Posição patrimonial (ativo, passivo, PL)." },
    ],
    processos: [{
      titulo: "Do lançamento às demonstrações",
      texto: "Um fato contábil gera um lançamento no Diário em partida dobrada (débito = crédito), classificado pelo Plano de Contas. Os lançamentos são acumulados no Razão por conta e conferidos no Balancete. No fechamento, as contas de resultado compõem a DRE e as patrimoniais o Balanço Patrimonial.",
      grafo: contabilidadeFluxo,
    }],
  },
];
