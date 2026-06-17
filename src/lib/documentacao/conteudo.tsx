// Conteúdo da Central de Documentação: processos do sistema em estilo BPMN.
// Cada módulo tem um resumo, as telas relacionadas e os processos (texto +
// diagrama). Os diagramas são autorados a partir dos fluxos reais já
// implementados (venda balcão/agendada, venda à ordem, cotação→aprovação CT→PC,
// requisição de materiais, recebimento/baixa financeira).
import type { LucideIcon } from "lucide-react";
import { Network, ShoppingCart, Boxes, ClipboardList, Wallet } from "lucide-react";
import type { BpmnGrafo } from "@/components/documentacao/ProcessoDiagram";

export type Tela = { label: string; href: string; descricao: string };
export type Processo = { titulo: string; texto: string; grafo: BpmnGrafo };
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
    resumo: "Contas a Receber, Contas a Pagar e Caixa. Cada título mostra a conta de contrapartida (onde o dinheiro caiu/sairá) e pode ser filtrado por conta. Uma trava impede que formas eletrônicas (Pix/cartão) sejam lançadas no Caixa em Dinheiro quando há banco cadastrado.",
    telas: [
      { label: "Contas a Receber", href: "/contas-receber", descricao: "Receber títulos; coluna e filtro por conta." },
      { label: "Contas a Pagar", href: "/contas-pagar", descricao: "Pagar títulos; conta de contrapartida." },
      { label: "Contas / Caixa", href: "/financeiro/contas", descricao: "Saldos e extrato por conta bancária/caixa." },
    ],
    processos: [{
      titulo: "Recebimento e baixa",
      texto: "Vendas e compras geram títulos (a receber/a pagar). Ao baixar, escolhe-se a forma e a conta de destino: dinheiro vai para o Caixa; formas eletrônicas (Pix, cartão) caem na conta bancária — a trava impede o eletrônico de cair no Caixa em Dinheiro. O lançamento move o saldo da conta.",
      grafo: financeiroFluxo,
    }],
  },
];
