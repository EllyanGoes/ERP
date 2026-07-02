// Conteúdo da Central de Documentação: processos do sistema em estilo BPMN.
// Cada módulo tem um resumo, as telas relacionadas e os processos (texto +
// diagrama). Os diagramas são autorados a partir dos fluxos reais já
// implementados (venda balcão/agendada, venda à ordem, cotação→aprovação CT→PC,
// requisição de materiais, recebimento/baixa financeira).
import type { LucideIcon } from "lucide-react";
import { Network, ShoppingCart, Boxes, ClipboardList, Wallet, Factory, Wrench, Calculator, ArrowLeftRight } from "lucide-react";
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

// ── TES (Tipos de Operação) ───────────────────────────────────────────────────
// 1) O que a TES define — e o que NÃO define.
const tesDefineFluxo: BpmnGrafo = {
  nodes: [
    { id: "a", tipo: "inicio", x: 0,   y: 60,  label: "Escolhe a TES na linha", sub: "compra / entrada / requisição" },
    { id: "b", tipo: "tarefa", x: 160, y: 44,  label: "TES = preset operacional", sub: "estocável? gera fiscal? gera financeiro? compõe custo? capitaliza?", cor: "azul" },
    { id: "c", tipo: "tarefa", x: 430, y: 44,  label: "Aplica as flags na linha", sub: "+ almoxarifado e centro sugeridos", cor: "cinza" },
    { id: "n", tipo: "nota",   x: 440, y: 150, label: "A TES NÃO carrega conta contábil nem decide CIF × Despesa" },
    { id: "z", tipo: "fim",    x: 690, y: 60,  label: "Linha pronta p/ estoque, fiscal e financeiro" },
  ],
  edges: [
    { from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "n", label: "atenção" }, { from: "c", to: "z" },
  ],
};

// 2) Herança da TES na compra (pedido → conferência → contábil).
const tesHerancaFluxo: BpmnGrafo = {
  nodes: [
    { id: "a", tipo: "inicio", x: 0,    y: 40,  label: "Pedido de Compra" },
    { id: "b", tipo: "tarefa", x: 130,  y: 24,  label: "Linha escolhe a TES", sub: "ex.: TES-E01 Matéria-Prima", cor: "ambar" },
    { id: "c", tipo: "tarefa", x: 350,  y: 24,  label: "Conferência / Entrada", sub: "herda TES, flags e almoxarifado", cor: "ambar" },
    { id: "d", tipo: "tarefa", x: 580,  y: -36, label: "Estoque (ENTRADA)", cor: "cinza" },
    { id: "e", tipo: "tarefa", x: 580,  y: 96,  label: "Contas a Pagar", cor: "verde" },
    { id: "f", tipo: "tarefa", x: 800,  y: -36, label: "Contábil", sub: "D Estoque / C Fornecedor", cor: "verde" },
    { id: "z", tipo: "fim",    x: 1020, y: 0,   label: "Entrada registrada" },
  ],
  edges: [
    { from: "a", to: "b" }, { from: "b", to: "c" },
    { from: "c", to: "d" }, { from: "c", to: "e" }, { from: "d", to: "f" }, { from: "f", to: "z" },
  ],
};

// 3) Roteamento contábil da saída — a precedência do material (o coração).
const tesRoteamentoFluxo: BpmnGrafo = {
  nodes: [
    { id: "a",  tipo: "inicio",  x: 0,   y: 120, label: "Item na requisição" },
    { id: "g1", tipo: "gateway", x: 190, y: 0,   label: "Compõe custo + MP/Insumo/Emb.?" },
    { id: "g2", tipo: "gateway", x: 190, y: 95,  label: "Tem destino manual?" },
    { id: "g3", tipo: "gateway", x: 190, y: 190, label: "Capitaliza?" },
    { id: "g4", tipo: "gateway", x: 190, y: 285, label: "Fabril + centro fabril?" },
    { id: "pep",  tipo: "tarefa", x: 470, y: -18, label: "PEP-MD (Material Direto)", sub: "D 1.1.3.0005.0001", cor: "violeta" },
    { id: "man",  tipo: "tarefa", x: 470, y: 80,  label: "Destino informado", sub: "vence a regra automática", cor: "cinza" },
    { id: "imo",  tipo: "tarefa", x: 470, y: 178, label: "Imobilizado em Andamento", cor: "cinza" },
    { id: "cif",  tipo: "tarefa", x: 470, y: 262, label: "CIF a Apropriar", sub: "D 1.1.4.0001", cor: "violeta" },
    { id: "desp", tipo: "tarefa", x: 470, y: 346, label: "Despesa", sub: "D 3.3.x (DRE)", cor: "verde" },
    { id: "z",    tipo: "fim",    x: 760, y: 150, label: "C Estoque (contrapartida)" },
  ],
  edges: [
    { from: "a", to: "g1" },
    { from: "g1", to: "pep", label: "sim" }, { from: "g1", to: "g2", label: "não" },
    { from: "g2", to: "man", label: "sim" }, { from: "g2", to: "g3", label: "não" },
    { from: "g3", to: "imo", label: "sim" }, { from: "g3", to: "g4", label: "não" },
    { from: "g4", to: "cif", label: "sim → CIF" }, { from: "g4", to: "desp", label: "não → Despesa" },
    { from: "pep", to: "z" }, { from: "man", to: "z" }, { from: "imo", to: "z" }, { from: "cif", to: "z" }, { from: "desp", to: "z" },
  ],
};

// 4) TES × Natureza × Centro × Item — quem decide o quê (ortogonais).
const tesVsNaturezaFluxo: BpmnGrafo = {
  nodes: [
    { id: "a",  tipo: "inicio", x: 0,   y: 150, label: "Uma operação", sub: "compra ou consumo" },
    { id: "t1", tipo: "tarefa", x: 200, y: 20,  label: "TES", sub: "estoque? fiscal? financeiro? + flags", cor: "azul" },
    { id: "t2", tipo: "tarefa", x: 200, y: 110, label: "Natureza", sub: "gerencial + flag cif → CIF a Apropriar", cor: "verde" },
    { id: "t3", tipo: "tarefa", x: 200, y: 200, label: "Centro de custo", sub: "fabril → CIF; senão Despesa", cor: "violeta" },
    { id: "t4", tipo: "tarefa", x: 200, y: 290, label: "Item", sub: "categoria, compõe custo, fabril, capitaliza", cor: "ambar" },
    { id: "z",  tipo: "tarefa", x: 500, y: 150, label: "Destino contábil final", sub: "PEP-MD / CIF / Despesa / Imobilizado", cor: "cinza" },
    { id: "f",  tipo: "fim",    x: 740, y: 166, label: "Lançamento correto" },
  ],
  edges: [
    { from: "a", to: "t1" }, { from: "a", to: "t2" }, { from: "a", to: "t3" }, { from: "a", to: "t4" },
    { from: "t1", to: "z" }, { from: "t2", to: "z" }, { from: "t3", to: "z" }, { from: "t4", to: "z" }, { from: "z", to: "f" },
  ],
};

// 5) Da compra ao custo do produto (contábil, ponta a ponta).
const tesCusteioFluxo: BpmnGrafo = {
  nodes: [
    { id: "a",  tipo: "inicio", x: 0,    y: 130, label: "Compra do material" },
    { id: "b",  tipo: "tarefa", x: 130,  y: 114, label: "Entrada", sub: "D Estoque / C Fornecedor", cor: "cinza" },
    { id: "g",  tipo: "gateway",x: 350,  y: 118, label: "Como é usado?" },
    { id: "md", tipo: "tarefa", x: 500,  y: -10, label: "Material direto", sub: "D PEP-MD / C Estoque", cor: "violeta" },
    { id: "ind",tipo: "tarefa", x: 500,  y: 110, label: "Indireto fabril", sub: "D CIF a Apropriar / C Estoque", cor: "violeta" },
    { id: "mod",tipo: "tarefa", x: 500,  y: 240, label: "Mão de obra (folha)", sub: "MOD → PEP-MOD · MOI → CIF", cor: "verde" },
    { id: "ap", tipo: "tarefa", x: 740,  y: 110, label: "Apropriação do CIF", sub: "D PEP-CIF / C CIF a Apropriar", cor: "violeta" },
    { id: "abs",tipo: "tarefa", x: 960,  y: 70,  label: "Absorção", sub: "D Produto Acabado / C PEP (MD+MOD+CIF)", cor: "ambar" },
    { id: "vd", tipo: "tarefa", x: 1200, y: 70,  label: "Venda", sub: "D CPV / C Produto Acabado", cor: "verde" },
    { id: "z",  tipo: "fim",    x: 1420, y: 86,  label: "Custo no resultado (CPV)" },
  ],
  edges: [
    { from: "a", to: "b" }, { from: "b", to: "g" },
    { from: "g", to: "md", label: "direto" }, { from: "g", to: "ind", label: "indireto" }, { from: "g", to: "mod", label: "pessoal" },
    { from: "ind", to: "ap" }, { from: "md", to: "abs" }, { from: "ap", to: "abs" }, { from: "mod", to: "abs" },
    { from: "abs", to: "vd" }, { from: "vd", to: "z" },
  ],
};

// ── Motor contábil: origens e variáveis ───────────────────────────────────────
// A) De onde vêm os lançamentos (cada fato gera seu lançamento, idempotente).
const origensFluxo: BpmnGrafo = {
  nodes: [
    { id: "v", tipo: "inicio", x: 0,   y: 0,   label: "Venda / Entrega" },
    { id: "c", tipo: "inicio", x: 0,   y: 80,  label: "Compra / Entrada" },
    { id: "e", tipo: "inicio", x: 0,   y: 160, label: "Estoque / Produção" },
    { id: "f", tipo: "inicio", x: 0,   y: 240, label: "Folha" },
    { id: "i", tipo: "inicio", x: 0,   y: 320, label: "Imobilizado / Fechamento" },
    { id: "r", tipo: "tarefa", x: 280, y: 150, label: "registrarLancamento()", sub: "monta as partidas (D/C) conforme a origem", cor: "verde" },
    { id: "n", tipo: "nota",   x: 290, y: 280, label: "Idempotente por (empresa, origemTipo, origemId) — não duplica" },
    { id: "d", tipo: "tarefa", x: 540, y: 150, label: "Diário (partida dobrada)", sub: "débito = crédito", cor: "verde" },
    { id: "z", tipo: "fim",    x: 760, y: 166, label: "Razão → DRE / Balanço" },
  ],
  edges: [
    { from: "v", to: "r" }, { from: "c", to: "r" }, { from: "e", to: "r" }, { from: "f", to: "r" }, { from: "i", to: "r" },
    { from: "r", to: "n" }, { from: "r", to: "d" }, { from: "d", to: "z" },
  ],
};

// B) As variáveis que determinam as contas e os valores da partida.
const variaveisFluxo: BpmnGrafo = {
  nodes: [
    { id: "a",  tipo: "inicio", x: 0,   y: 150, label: "Um fato contábil" },
    { id: "v1", tipo: "tarefa", x: 210, y: -20, label: "origemTipo (o evento)", sub: "escolhe o padrão D/C", cor: "azul" },
    { id: "v2", tipo: "tarefa", x: 210, y: 60,  label: "Natureza (+ flag cif)", sub: "resultado × CIF a Apropriar", cor: "verde" },
    { id: "v3", tipo: "tarefa", x: 210, y: 140, label: "Item", sub: "categoria, compõe custo, fabril, capitaliza", cor: "ambar" },
    { id: "v4", tipo: "tarefa", x: 210, y: 220, label: "Centro fabril", sub: "CIF × Despesa do indireto", cor: "violeta" },
    { id: "v5", tipo: "tarefa", x: 210, y: 300, label: "Empresa · Local · Beneficiário", sub: "revenda×fábrica · conta do local · analítica", cor: "cinza" },
    { id: "z",  tipo: "tarefa", x: 520, y: 150, label: "Contas + valores da partida", sub: "custo pelo CMPM da empresa", cor: "verde" },
    { id: "f",  tipo: "fim",    x: 740, y: 166, label: "Lançamento determinado" },
  ],
  edges: [
    { from: "a", to: "v1" }, { from: "a", to: "v2" }, { from: "a", to: "v3" }, { from: "a", to: "v4" }, { from: "a", to: "v5" },
    { from: "v1", to: "z" }, { from: "v2", to: "z" }, { from: "v3", to: "z" }, { from: "v4", to: "z" }, { from: "v5", to: "z" }, { from: "z", to: "f" },
  ],
};

// ── CPV / Custeio por absorção ─────────────────────────────────────────────────
// 1) Taxa predeterminada — custear MOD/CIF em tempo real.
const cpvTaxaFluxo: BpmnGrafo = {
  nodes: [
    { id: "a", tipo: "inicio", x: 0,   y: 110, label: "Parâmetros da competência", sub: "biomassa, energia, combustível, MOD, MOI, depreciação" },
    { id: "b", tipo: "tarefa", x: 250, y: 30,  label: "Taxa CIF / milheiro", sub: "custo indireto ÷ volume produzido", cor: "violeta" },
    { id: "c", tipo: "tarefa", x: 250, y: 170, label: "Taxa MOD / milheiro", sub: "mão de obra ÷ volume produzido", cor: "verde" },
    { id: "d", tipo: "tarefa", x: 500, y: 100, label: "Custo por produto", sub: "Material (BOM × CMPM) + MOD + CIF", cor: "ambar" },
    { id: "e", tipo: "tarefa", x: 730, y: 100, label: "Aplicar ao estoque de PA", sub: "valora o produto acabado", cor: "verde" },
    { id: "z", tipo: "fim",    x: 960, y: 116, label: "Cada milheiro já absorve MOD + CIF" },
  ],
  edges: [
    { from: "a", to: "b" }, { from: "a", to: "c" }, { from: "b", to: "d" }, { from: "c", to: "d" }, { from: "d", to: "e" }, { from: "e", to: "z" },
  ],
};

// 2) Fechamento do mês — do custo real ao produto acabado.
const cpvFechamentoFluxo: BpmnGrafo = {
  nodes: [
    { id: "a",  tipo: "inicio", x: 0,   y: 90,  label: "Fechamento do mês" },
    { id: "fo", tipo: "tarefa", x: 170, y: 74,  label: "Folha apropriada", sub: "MOD → PEP-MOD · MOI → CIF a Apropriar", cor: "verde" },
    { id: "ci", tipo: "tarefa", x: 420, y: 0,   label: "Apropriar CIF", sub: "CIF a Apropriar (1.1.4.0001) → PEP-CIF (…0003)", cor: "violeta" },
    { id: "ab", tipo: "tarefa", x: 700, y: 74,  label: "Absorver MOD + CIF", sub: "D Produto Acabado / C PEP, rateio por volume", cor: "ambar" },
    { id: "z",  tipo: "fim",    x: 960, y: 90,  label: "PA custeado por absorção" },
  ],
  edges: [
    { from: "a", to: "fo" }, { from: "fo", to: "ci", label: "MOI" }, { from: "fo", to: "ab", label: "MOD" }, { from: "ci", to: "ab" }, { from: "ab", to: "z" },
  ],
};

// 3) Custo absorvido (produzido) × CPV efetivo (vendido).
const cpvAbsorvidoEfetivoFluxo: BpmnGrafo = {
  nodes: [
    { id: "a", tipo: "inicio", x: 0,   y: 110, label: "Custo do produto" },
    { id: "g", tipo: "gateway",x: 180, y: 114, label: "Produzido ou vendido?" },
    { id: "ab",tipo: "tarefa", x: 360, y: 20,  label: "Custo absorvido", sub: "o que foi FABRICADO no mês (material + MOD + CIF)", cor: "ambar" },
    { id: "ef",tipo: "tarefa", x: 360, y: 210, label: "CPV efetivo", sub: "o que foi VENDIDO — baixa do PA (razão 3.2.2)", cor: "verde" },
    { id: "z", tipo: "fim",    x: 640, y: 126, label: "Relatórios mês a mês" },
  ],
  edges: [
    { from: "a", to: "g" }, { from: "g", to: "ab", label: "fabricado" }, { from: "g", to: "ef", label: "vendido" }, { from: "ab", to: "z" }, { from: "ef", to: "z" },
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
          "Para Clientes a Receber, Fornecedores e Salários a Pagar, escolha a conta SINTÉTICA marcada “(por beneficiário)”: a analítica de cada cliente/fornecedor/colaborador é resolvida automaticamente pelo beneficiário do título — não se cadastra uma natureza por cliente.",
          "Use uma analítica direta na contrapartida só para títulos SEM beneficiário (ex.: Outros a Receber, INSS/FGTS a Recolher).",
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
    id: "tes", label: "Tipos de Operação (TES)", icon: ArrowLeftRight,
    resumo: "A TES (Tipo de Entrada e Saída, à moda do Protheus) é um preset de COMPORTAMENTO de uma operação: diz se movimenta estoque, se gera fiscal (CFOP) e financeiro, se o item compõe custo e se pode capitalizar — e preenche essas flags na linha do pedido, da conferência e da requisição. Ela NÃO carrega conta contábil e NÃO decide sozinha se um gasto vira Custo, CIF ou Despesa: o destino contábil é resolvido pela precedência do material (categoria e flags do item + centro de custo fabril + natureza). Este módulo mostra, em tópicos, como a TES organiza a operação e como ela se conecta ao motor contábil.",
    telas: [
      { label: "Tipos de Op. (TES)", href: "/suprimentos/tipos-operacao", descricao: "Cadastro das TES e suas flags de comportamento." },
      { label: "Centros de Custo", href: "/empresa/centros-custo", descricao: "Marcar centro como fabril (decide CIF × Despesa do indireto)." },
      { label: "Naturezas Financeiras", href: "/financeiro/naturezas", descricao: "Classificação gerencial + flag CIF (CIF a Apropriar)." },
      { label: "Produtos", href: "/suprimentos/produtos", descricao: "Flags do item: compõe custo, fabril, capitaliza, categoria." },
      { label: "Requisições de Materiais", href: "/suprimentos/requisicoes-materiais", descricao: "Saída/consumo onde o destino contábil é roteado." },
      { label: "Diário Contábil", href: "/contabilidade/lancamentos", descricao: "Onde o lançamento resultante aparece." },
    ],
    processos: [
      {
        titulo: "1. O que a TES define — e o que não define",
        texto: "Ao lançar uma linha (compra, entrada ou requisição), a TES aplica um preset de comportamento operacional: se a operação entra em estoque, se gera CFOP/nota fiscal, se gera título financeiro, se o item compõe custo e se pode capitalizar. Ela também sugere o almoxarifado e o centro de custo. O que a TES NÃO faz: não guarda conta contábil e não decide, por si só, se o valor vira Custo, CIF ou Despesa — isso é definido depois, pela precedência do material.",
        grafo: tesDefineFluxo,
        detalhes: [
          "Campos da TES: sentido (Entrada/Saída), estocável, compõe custo, permite capitalizar, gera financeiro, gera fiscal, CFOP, natureza fiscal, almoxarifado padrão e centro de custo sugerido.",
          "As flags viajam para a linha do Pedido de Compra → Conferência → Requisição (herança). Onde a linha deixa a flag em branco, ela herda o cadastro do item.",
          "gera financeiro / gera fiscal são informativos/validação — a contabilização da entrada acontece por haver movimentação de estoque, não por consultar a TES.",
          "TES padrão já cadastradas: Entrada (Matéria-Prima, Insumos, Combustível, Embalagem, MRO/Manutenção, Revenda, Imobilizado, Uso e Consumo, Serviço) e Saída (Material Direto, Manutenção Fabril/CIF, Administrativo/Despesa, Imobilizado/Obra, Troca de Componente).",
        ],
      },
      {
        titulo: "2. Herança da TES na compra até o contábil",
        texto: "Na linha do Pedido de Compra escolhe-se a TES (ex.: TES-E01 Matéria-Prima). Ao gerar a Conferência de entrada, a TES, suas flags e o almoxarifado padrão são herdados. Concluída a conferência, o estoque é atualizado e o motor contábil lança a entrada — D Estoque (conta do local) / C Fornecedor — e o título em Contas a Pagar. A TES organizou a operação; o lançamento sai da movimentação de estoque.",
        grafo: tesHerancaFluxo,
        detalhes: [
          "A conta de Estoque debitada vem do LOCAL de estoque (não da categoria) — cada local tem sua conta no plano de contas.",
          "Compra de material vai para Estoque (Ativo); só vira custo/despesa no consumo ou na venda.",
          "Origem contábil da entrada: ESTOQUE_ENTRADA (idempotente por conferência).",
        ],
      },
      {
        titulo: "3. Roteamento contábil da saída (a precedência)",
        texto: "No consumo/requisição, o destino contábil é decidido por uma ordem de precedência que lê as flags que a TES (e o item) preencheram. Primeiro: material que compõe custo e é matéria-prima/insumo/embalagem vai para o PEP-MD (produto em elaboração). Se não, um destino manual informado vence. Depois: item que capitaliza vira Imobilizado. Depois: item indireto de fábrica vira CIF se o centro for fabril, ou Despesa se não for. Por fim, o padrão é Despesa. O lançamento é sempre D <destino> / C Estoque.",
        grafo: tesRoteamentoFluxo,
        detalhes: [
          "1º Compõe custo + categoria direta (matéria-prima/insumo/embalagem) → PEP-MD (1.1.3.0005.0001).",
          "2º Destino manual na requisição → vence a regra automática (escape).",
          "3º Item capitaliza → Imobilizado em Andamento.",
          "4º Item fabril (indireto): centro de custo fabril → CIF a Apropriar (1.1.4.0001); centro não-fabril → Despesa (3.3.x).",
          "5º Sem enquadrar → Despesa. Contrapartida sempre: C Estoque.",
          "É aqui que o centro de custo fabril importa: sem centro marcado como fabril, o indireto cai em Despesa em vez de CIF.",
        ],
      },
      {
        titulo: "4. TES × Natureza × Centro × Item: quem decide o quê",
        texto: "Quatro dimensões atuam sobre a mesma operação, e são ortogonais (cada uma responde por uma coisa). A TES define o comportamento operacional (estoque, fiscal, financeiro e as flags). A Natureza é a classificação gerencial e, quando marcada como CIF, manda o débito da compra para 'CIF a Apropriar' em vez de uma conta de resultado. O Centro de custo fabril decide CIF × Despesa do consumo indireto. E o Item (categoria, compõe custo, fabril, capitaliza) fecha o destino final. Juntos, produzem o lançamento correto.",
        grafo: tesVsNaturezaFluxo,
        detalhes: [
          "TES = comportamento (não é conta contábil).",
          "Natureza = gaveta gerencial + ponte contábil; a flag 'cif' roteia a compra para CIF a Apropriar.",
          "Centro de custo 'fabril' = liga/desliga o CIF do consumo indireto (senão vira Despesa).",
          "Item = a palavra final do destino (compõe custo/categoria → PEP-MD; capitaliza → Imobilizado; fabril → CIF/Despesa).",
        ],
      },
      {
        titulo: "5. Da compra ao custo do produto (ponta a ponta)",
        texto: "Fechando o ciclo com a contabilidade: a compra entra no Estoque. No uso, o material direto vai para o PEP-MD; o indireto fabril acumula em CIF a Apropriar; a folha aloca MOD no PEP-MOD e MOI no CIF. No fechamento, a apropriação leva o CIF a Apropriar para o PEP-CIF, e a absorção transfere PEP (material + MOD + CIF) para o Produto Acabado. Na venda, o custo sai como CPV no resultado. Assim o produto acabado carrega o custo por absorção (material + mão de obra + indiretos).",
        grafo: tesCusteioFluxo,
        detalhes: [
          "PEP (Produto em Processo) 1.1.3.0005: subcontas Materiais Aplicados (…0001), MOD (…0002) e CIF (…0003), no Ativo.",
          "CIF a Apropriar 1.1.4.0001: staging do custo indireto real até a apropriação ao PEP-CIF.",
          "Absorção: D Produto Acabado (1.1.3.0003) / C PEP, rateando pela produção do período.",
          "Venda: D CPV (3.2.2.0001) / C Produto Acabado — o custo só vira resultado quando o produto é vendido.",
        ],
      },
    ],
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
    processos: [
      {
        titulo: "Do lançamento às demonstrações",
        texto: "Um fato contábil gera um lançamento no Diário em partida dobrada (débito = crédito), classificado pelo Plano de Contas. Os lançamentos são acumulados no Razão por conta e conferidos no Balancete. No fechamento, as contas de resultado compõem a DRE e as patrimoniais o Balanço Patrimonial.",
        grafo: contabilidadeFluxo,
      },
      {
        titulo: "Origem dos lançamentos: cada fato gera o seu",
        texto: "Nenhum lançamento é digitado à mão (exceto o lançamento manual). Cada evento do sistema — uma venda, uma entrada de compra, um consumo, a folha, a depreciação — chama o motor contábil, que monta as partidas certas para aquela ORIGEM. Toda origem carrega um par (origemTipo, origemId) e é idempotente: reprocessar não duplica. A tabela abaixo lista todas as origens e o padrão débito/crédito de cada uma.",
        grafo: origensFluxo,
        detalhes: [
          "VENDA → título a receber: D Clientes a Receber / C Receita. Origem: confirmação/entrega do pedido (modelo venda-entrega).",
          "RECEITA_ENTREGA → reconhece a receita na entrega: D Bens/Material a Entregar / C Receita (o recebível nasce na entrega, não duplica a VENDA).",
          "RECEBIMENTO → baixa do a receber: D Caixa/Banco (conta real) / C Clientes a Receber.",
          "COMPRA → título a pagar: D Estoque, CIF a Apropriar ou Despesa / C Fornecedores (o destino do débito depende das variáveis; ver tópico seguinte).",
          "PAGAMENTO → baixa do a pagar: D Fornecedores / C Caixa/Banco (conta real).",
          "ESTOQUE_ENTRADA → conferência de compra: D Estoque (conta do LOCAL) / C Fornecedor.",
          "ESTOQUE_SAIDA → baixa na venda: D CMV (revenda, 3.2.1) ou CPV (fábrica, 3.2.2) / C Estoque.",
          "ESTOQUE_CONSUMO → requisição/consumo: D PEP-MD, CIF a Apropriar, Despesa ou Imobilizado / C Estoque (roteado pela precedência do material).",
          "ESTOQUE_PRODUCAO → apontamento/absorção: movimenta o PEP e o Produto Acabado (D Estoque/PA / C Custo de Produção; absorve MOD/CIF).",
          "ESTOQUE_AJUSTE → inventário: perda = D Perdas / C Estoque; sobra = D Estoque / C Sobras (pelo sinal do ajuste).",
          "ESTOQUE_TRANSFERENCIA → entre locais: D Estoque (destino) / C Estoque (origem).",
          "FOLHA_PAGAMENTO → apropriação da folha: D PEP-MOD (MOD), CIF a Apropriar (MOI) ou Despesa (ADMIN) / C Salários a Pagar (e encargos).",
          "DEPRECIACAO → D Despesa de Depreciação (ou CIF, se o bem for fabril) / C Depreciação Acumulada.",
          "BAIXA_IMOBILIZADO → troca de componente (CPC 27): D Depreciação Acumulada + Perda / C Imobilizado.",
          "COMPENSACAO_AJUSTE → juros/multa/desconto no Encontro de Contas (Compensação Pagar/Receber).",
          "ENCERRAMENTO → zera as contas de resultado contra o Patrimônio Líquido no fim do exercício.",
          "MANUAL → lançamento avulso feito pelo usuário no Diário. ESTORNO → reversão espelhada de um lançamento (aponta para o original).",
        ],
      },
      {
        titulo: "As variáveis que determinam o lançamento",
        texto: "Dentro de cada origem, quais CONTAS e VALORES entram na partida não é fixo — depende de um conjunto de variáveis de negócio. Entender essas variáveis é entender por que um mesmo tipo de gasto às vezes vira Estoque, às vezes Custo, às vezes CIF e às vezes Despesa. São elas que traduzem a operação em débito e crédito.",
        grafo: variaveisFluxo,
        detalhes: [
          "origemTipo (o evento): escolhe a função do motor e o esqueleto do lançamento (o padrão D/C do tópico anterior).",
          "Natureza Financeira: nos títulos (venda/compra) define a conta de resultado e a contrapartida; a flag 'cif' desvia o débito da compra para CIF a Apropriar (1.1.4.0001) em vez da DRE.",
          "Contrapartida por beneficiário: Clientes/Fornecedores/Salários usam a conta SINTÉTICA; a analítica de cada cliente/fornecedor/colaborador é resolvida pelo beneficiário do título (não se cadastra conta por pessoa).",
          "Item: categoria de estoque + 'compõe custo' → material direto (PEP-MD); 'capitaliza' → Imobilizado; 'fabril' → CIF/Despesa. É a palavra final do destino no consumo.",
          "Centro de custo fabril: liga/desliga o CIF do consumo indireto (centro fabril → CIF; senão → Despesa).",
          "Empresa (industrializa × revenda): decide CPV × CMV na venda e se a compra de material vai para Estoque (revenda) ou é tratada como custo/despesa (fábrica).",
          "Local de estoque: define QUAL conta de estoque é debitada/creditada (a conta segue o local, não a categoria).",
          "Estágio (WIP) e natureza como dimensão: viajam na partida do PEP/CIF como marcadores gerenciais (permitem razão por estágio e por natureza).",
          "Custo unitário: o valor da partida de estoque usa o custo médio por empresa (CMPM / ItemCustoEmpresa); acabado de revenda custeia pelo custo de compra.",
          "Conta de destino da baixa: no recebimento/pagamento, usa sempre a conta real (Caixa em Dinheiro por empresa, ou o banco) onde o dinheiro entrou/saiu.",
          "Destino manual (requisição): quando informado, vence a regra automática de roteamento.",
        ],
      },
    ],
  },
  {
    id: "cpv", label: "Custeio do Produto (CPV)", icon: Calculator,
    resumo: "O produto acabado é custeado por ABSORÇÃO: carrega Material Direto + Mão de Obra Direta (MOD) + Custo Indireto de Fabricação (CIF). A tela CPV tem quatro abas: 'Definição de taxa pré-definida' (deriva as taxas de MOD/CIF por milheiro e valora o acabado em tempo real), 'Fechamentos' (apropria o CIF real e absorve MOD/CIF ao estoque), 'Custo absorvido' (o que foi fabricado no mês) e 'CPV efetivo' (o que foi vendido, pelo razão). O custo só vira resultado (CPV) quando o produto é vendido.",
    telas: [
      { label: "CPV — Custo dos Produtos", href: "/contabilidade/cpv", descricao: "Taxa predeterminada, fechamentos e os relatórios de custo." },
      { label: "RH — Folhas", href: "/rh/folhas", descricao: "Fecha a folha: MOD → PEP-MOD, MOI → CIF." },
      { label: "Diário Contábil", href: "/contabilidade/lancamentos", descricao: "Onde apropriação, absorção e CPV aparecem." },
    ],
    processos: [
      {
        titulo: "1. Taxa predeterminada: custear em tempo real",
        texto: "Sem esperar o fechamento, cada milheiro produzido já absorve MOD e CIF por uma taxa predeterminada — derivada do custo do período dividido pelo volume produzido. Informa-se os parâmetros da competência (biomassa, energia, combustível, MOD, MOI, depreciação); o sistema calcula CIF/milheiro e MOD/milheiro e monta o custo por produto (Material da engenharia BOM × CMPM + MOD + CIF). O botão 'Aplicar ao estoque de PA' grava esse custo no produto acabado.",
        grafo: cpvTaxaFluxo,
        detalhes: [
          "Custo Total por milheiro = Material Direto + MOD + CIF (as três parcelas).",
          "Material Direto: consumo da engenharia (BOM) × custo médio por empresa (CMPM), média ponderada pelo volume de cada produto.",
          "MOD e CIF são as TAXAS predeterminadas (custo do mês ÷ volume de milheiros) — permitem valorar o acabado antes do fechamento.",
          "'Aplicar ao estoque de PA' passa a valorar o Produto Acabado e o CPV por esse custo.",
        ],
      },
      {
        titulo: "2. Fechamento do mês: do custo real ao produto",
        texto: "No fechamento leva-se o custo REAL ao produto. A folha, ao ser fechada, aloca MOD no PEP-MOD e MOI no CIF a Apropriar. 'Apropriar CIF' move o saldo de CIF a Apropriar (1.1.4.0001) para o PEP-CIF (1.1.3.0005.0003). 'Absorver' transfere o PEP (Material + MOD + CIF) para o Produto Acabado, rateando pela produção do período. Assim o acabado passa a carregar o custo real de conversão.",
        grafo: cpvFechamentoFluxo,
        detalhes: [
          "Apropriar CIF: D PEP-CIF (1.1.3.0005.0003) / C CIF a Apropriar (1.1.4.0001) — zera o staging e leva o CIF real ao custo de produção.",
          "MOD/MOI vêm da folha (RH → Folhas): MOD → PEP-MOD (…0002), MOI → CIF a Apropriar.",
          "Absorver: D Produto Acabado (1.1.3.0003) / C PEP (MD + MOD + CIF), pela produção finalizada — o que sobra fica como PEP (produtos em elaboração).",
          "Custeio por absorção (CPC 16): MOD/CIF ficam no Ativo (PEP/PA) durante o processo e só entram no resultado como CPV na venda.",
        ],
      },
      {
        titulo: "3. Custo absorvido × CPV efetivo",
        texto: "São dois olhares diferentes, em abas separadas. 'Custo absorvido' mostra o que foi FABRICADO no mês — material (BOM × CMPM) + MOD + CIF reais, absorvidos pelo volume produzido. 'CPV efetivo' mostra o que foi VENDIDO — o CPV real lançado no razão (3.2.2), a baixa do produto acabado na venda. Produzir não é vender: um produto fabricado num mês pode ser vendido em outro, por isso os dois relatórios divergem.",
        grafo: cpvAbsorvidoEfetivoFluxo,
        detalhes: [
          "Custo absorvido: visão de PRODUÇÃO (entra no estoque de acabado). Não é o que foi vendido.",
          "CPV efetivo: visão de VENDA (sai do estoque como custo na DRE), conta 3.2.2.0001.",
          "A quebra do CPV por componente (material/MOD/CIF) é estimada pela composição do custo; o total é o real do razão.",
        ],
      },
    ],
  },
];
