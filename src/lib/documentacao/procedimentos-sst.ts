// Procedimentos de SST mostrados na própria tela (botão "Procedimento" da nova
// entrega de EPI) e na Central de Documentação — fonte única do texto.

export type PassoProcedimento = { titulo: string; texto: string };

/** EPI que o colaborador já recebeu antes e ainda não está registrado no sistema. */
export const PROCEDIMENTO_EPI_RETROATIVO: PassoProcedimento[] = [
  { titulo: "Abra a entrega por colaborador", texto: "SST › EPIs › Nova entrega › Para um colaborador (ou o botão de entrega na ficha do colaborador) e escolha o colaborador." },
  { titulo: "Confira o histórico", texto: "Na aba Histórico de entregas, veja se essa entrega já não foi lançada — evita registro em dobro." },
  { titulo: "Informe a data real", texto: "Em Data da entrega, coloque o dia em que ele de fato recebeu (não a data de hoje). A vida útil e o vencimento contam a partir dela e o termo sai com essa data. Entregas em dias diferentes = uma entrega para cada data." },
  { titulo: "Decida a baixa de estoque", texto: "Escolha Não baixar se a saída já foi lançada no estoque (requisição/ajuste) ou se a peça nunca entrou no sistema. Só escolha um local se a peça ainda consta no saldo — a baixa entra com a data informada." },
  { titulo: "Marque só o que foi entregue", texto: "Selecione apenas os EPIs entregues naquela data, com tamanho e quantidade. Se o sistema pedir motivo de troca antes do prazo, informe “registro retroativo”." },
  { titulo: "Registre e arquive o termo", texto: "Clique em Registrar e gerar termo, imprima, colha a assinatura do colaborador e anexe o termo assinado (na hora ou depois, na aba Fichas). Sem o anexo a ficha fica pendente." },
];
