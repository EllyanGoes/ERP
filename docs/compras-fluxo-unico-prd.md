# PRD — Compras em fluxo único

> Status: **decisões do dono registradas em 09/11/2026** (§9). Fases 0 a 3 implementadas; Fase 4 fora, pela decisão D1.
> Princípio central: **quem compra preenche uma vez só.** SC, cotação e pedido continuam existindo
> como registros, mas deixam de ser três digitações. O DE continua separado, porque é o documento
> real de onde saem estoque, contabilidade e contas a pagar.

## 1. Contexto e objetivo

O fluxo atual tem quatro etapas: SC → CT → PC → DE. O kanban de compras (`/compras/acompanhamento`,
em produção desde 09/11/2026) já mostra cada compra como um cartão único, mas o trabalho por trás
continua dividido em três formulários. Dados de produção, últimos 180 dias:

| Medição | Resultado | O que indica |
|---|---|---|
| SC e CT lançadas pela mesma pessoa | 405 de 407 com autoria registrada | A separação entre quem pede e quem cota não existe na prática |
| Usuários distintos que criaram SC | 3, em 702 SCs | Os pedidos chegam por fora e o comprador digita |
| Tempo mediano SC → CT e CT → PC | 0 dia | Documentos lançados em sequência, no mesmo dia |
| Cotações concluídas com 1 fornecedor respondendo | 267 de 546 (49%) | Metade das cotações não compara preço |
| Cotações com 3 ou mais fornecedores | 10 de 546 (2%) | |
| Pedidos via cotação até R$ 1.000 | 361 de 460 (78%), R$ 131,6 mil de R$ 546,6 mil (24% do valor) | Volume alto, valor baixo |
| Pedidos via cotação acima de R$ 1.000 | 99 de 460 (22%), R$ 415,0 mil (76% do valor) | Concentra o valor comprado |
| Pedidos acima de R$ 10.000 | 6 | |

Mediana de 0 dia não distingue processo rápido de lançamento depois da compra feita. Por isso o
histórico de status (§4.1) vem antes de qualquer mudança no formulário.

O código também já trata a compra como uma linha: a API bloqueia uma segunda cotação para a mesma SC
e `gerarPedidoDeCotacao` bloqueia um segundo pedido ativo. Das 459 SCs com pedido, só 5 têm dois.

**Objetivo:** registrar uma compra em uma única tela e responder, olhando o quadro, **quem está
segurando cada compra e há quanto tempo**.

## 2. Personas e usos

| Persona | O que precisa |
|---|---|
| Comprador | Registrar a compra, com itens, fornecedores e preços, sem repetir digitação. |
| Aprovador | Decidir com os preços comparados à vista, pelos canais atuais (tela e Telegram). |
| Almoxarifado / fiscal | Dar entrada na nota a partir da compra, sem redigitar. |
| Dono / diretoria | Ver onde as compras estão paradas e quem deve a próxima ação. |
| Quem precisa do material | Hoje pede por fora. Portal próprio depende da decisão D1 (§9). |

## 3. Conceitos

- **Compra:** a linha formada por SC + CT + PC + DE, identificada pelo documento raiz. **Não é uma
  tabela nova**: é a mesma derivação do kanban (`lib/compras-processo.ts`).
- **Nova compra:** formulário único que cria SC e CT na mesma transação.
- **Etapa de espera:** coluna do quadro definida por quem deve a próxima ação, não pelo tipo de documento.

### Colunas do quadro

| Coluna | Quem deve agir | Documentos e status |
|---|---|---|
| Em montagem | Comprador | SC `RASCUNHO`, `APROVADA`, `EM_COTACAO`, `PARCIALMENTE_ATENDIDA`; CT `PENDENTE`, `EM_ANALISE`; PC `RASCUNHO` |
| Aguardando aprovação | Aprovador | CT e PC `AGUARDANDO_APROVACAO` |
| Aguardando entrega | Fornecedor ou financeiro | PC `AGUARDANDO_PAGAMENTO`, `CONFIRMADO`, `EM_TRANSITO`, `ENVIADO`, sem DE |
| Em conferência | Almoxarifado / fiscal | DE `PENDENTE`, `EM_CONFERENCIA`, `DIVERGENCIA` |

`AGUARDANDO_PAGAMENTO` fica na mesma coluna, separado pelo filtro de status do cabeçalho, para
distinguir o que depende do financeiro do que depende do fornecedor.

## 4. Modelo de dados (Prisma; migrations idempotentes, sem `db push` em produção)

SC, CT, PC e DE **não mudam de estrutura**. Entra só o histórico abaixo.

### 4.1 Histórico de status

`CompraStatusLog`: `id`, `empresaId`, `documentoTipo` (SC, CT, PC, DE), `documentoId`, `statusDe`
(nulo na criação), `statusPara`, `usuario` (de `atualizadoPor`, pode ser nulo), `criadoEm`.
Índices em `(documentoTipo, documentoId)` e `(criadoEm)`.

Gravação por **trigger no Postgres** nas quatro tabelas. O status muda em dezenas de rotas, webhooks
e no `prismaSemEscopo`; gravar pela aplicação deixaria caminhos sem registro. Limitação: alterações
feitas por caminhos que não carimbam `atualizadoPor` ficam sem usuário. O histórico vale daqui para
frente; o passado não é reconstruído.

## 5. Motor (`src/lib/compras-fluxo.ts`)

- `criarCompra(tx, dados)`: numa só transação, gera SC e CT pelas sequências da empresa
  (`proximaSequenciaDaEmpresa`), cria `CotacaoFornecedor` e itens com os preços informados e deixa a
  SC em `EM_COTACAO`. Continuam obrigatórios filial, local de estoque, motivo e ao menos um item.
- Empresa alvo validada contra as empresas da sessão, como no POST atual da SC (modo grupo).
- A lógica de `cotacoes/[id]/submeter-aprovacao` passa para uma função reutilizável, chamada pela
  rota atual e por "Salvar e enviar para aprovação".
- **`gerarPedidoDeCotacao` não muda**: a aprovação continua gerando o PC pelos dois canais, com as
  mesmas travas contra pedido duplicado e o mesmo tratamento de frete, desconto e encargos.
- **Sem mínimo de propostas:** continua bastando um fornecedor respondido para enviar à aprovação.
  Quem avalia se a comparação foi suficiente é o aprovador (D2).
- `lib/compras-processo.ts` passa a mapear as colunas da §3. As regras de arraste acompanham.

## 6. Telas

- **Nova compra** (CreateDrawer, aberto pelo kanban): solicitante, empresa, filial, local, motivo e
  itens; abaixo, uma grade com uma coluna de preço por fornecedor e frete, desconto e condição por
  proposta. Ações: "Salvar rascunho" e "Salvar e enviar para aprovação".
- **Com um só fornecedor**, a grade vira uma coluna simples.
- **Aprovação (tela e Telegram):** passa a mostrar quantas propostas foram recebidas e o valor de cada
  uma. Hoje o texto do Telegram traz só o nome da cotação (os valores vão no PDF anexo, quando há DM)
  e a lista de aprovações destaca o vencedor. Sem isso, o aprovador não consegue reprovar por falta
  de comparação sem abrir a cotação.
- **Reprovação:** continua devolvendo a cotação para `EM_ANALISE`, com o motivo avisado ao comprador.
- **Ficha da compra** (evolução do `AcompanhamentoDetalheDialog`): itens, propostas, aprovação, pedido,
  entrada e linha do tempo do histórico de status, com atalho para cada documento.
- **Kanban:** quatro colunas da §3, com quantidade, idade mediana e total acima de 30 dias no cabeçalho.
- **Menu:** "Solicitação" e "Cotação" saem do menu na Fase 3. As páginas e URLs continuam acessíveis,
  inclusive para documentos antigos e para a análise detalhada de propostas (`/cotacoes/[id]/analise`).
- Convenções do projeto: `ComboboxWithCreate`, `DatePicker`, filtros persistidos, `sm:max-w-*` em
  dialogs, `ProdutoQuickModal` para produto novo sem sair do formulário.

## 7. Permissões (`modules.ts`)

Sem módulo novo. Criar e acompanhar: módulo `compras`. Aprovar: aprovador do fluxo `PEDIDO_COMPRAS`
ou ADMIN, como hoje.

## 8. Fases

| Fase | Entrega | Por que nessa ordem |
|---|---|---|
| 0 | Histórico de status, idade nas colunas e revisão dos parados (51 PCs confirmados sem DE, que se revelaram todos intragrupo e saíram do quadro; 22 cotações abertas em SCs canceladas ou rejeitadas; cerca de 67 SCs em `EM_PEDIDO` sem pedido vivo) | Cria a linha de base antes de mudar o processo |
| 1 | Nova compra (`criarCompra` + formulário único), convivendo com os formulários atuais, e propostas visíveis na aprovação | Entrega o ganho principal sem retirar nada |
| 2 | Colunas por etapa de espera e ficha da compra | Depende do histórico para mostrar tempos confiáveis |
| 3 | Retirada de SC e CT do menu | Só depois de o time adotar a Nova compra |
| 4 (opcional) | Pedido simples feito por quem precisa do material | Depende de D1 |

A revisão dos parados só apresenta listas para decisão; nenhum documento é alterado sem aprovação
do dono.

## 9. Decisões do dono (09/11/2026)

| # | Decisão | Consequência |
|---|---|---|
| D1 | O comprador continua registrando a compra | O campo solicitante continua; pedido direto de quem precisa do material fica para a Fase 4 |
| D2 | Mais de um fornecedor **não é obrigatório**. O aprovador pode reprovar por falta de comparação | Sem valor de referência nem justificativa; a aprovação precisa mostrar as propostas recebidas |
| D3 | Toda compra continua passando por aprovação | O fluxo `PEDIDO_COMPRAS` não muda |

## 10. Fora de escopo

- Fundir SC, CT e PC numa tabela única.
- Exigir número mínimo de propostas, por valor ou por categoria (D2).
- Dispensar aprovação em compras pequenas (D3).
- Alterar o DE, o motor contábil, o estoque ou as contas a pagar.
- Comprar de dois fornecedores na mesma compra: seguem como duas compras, como o código já exige.
- Obrigar toda compra a nascer de SC (DEs avulsos e pedidos intragrupo continuam).
- Reconstruir o histórico de tempos anteriores à Fase 0.

## 11. Riscos

| Risco | Mitigação |
|---|---|
| Duas telas de criação durante a transição | Mesmo motor por trás; retirada dos formulários antigos só na Fase 3 |
| Aprovação por Telegram ou web quebrar | `gerarPedidoDeCotacao` não muda; a extração do submeter-aprovacao mantém a rota atual |
| Relatórios (SPEND, SLA, OTD) e telas antigas | Continuam lendo as mesmas tabelas, com os registros preenchidos do mesmo jeito |
| Compras seguirem sem comparação de preços | Decisão do aprovador (D2), com as propostas visíveis; acompanhar o indicador da §12 |

## 12. Métricas de sucesso

| Métrica | Hoje | Meta |
|---|---|---|
| Telas para registrar uma compra até a aprovação | 2 (SC e CT) | 1 |
| Compras com 2 ou mais propostas | 49% das cotações concluídas têm só 1 resposta | Acompanhar, sem meta obrigatória |
| Compras paradas há mais de 30 dias | Medir na Fase 0 | Reduzir pela metade em 3 meses |
| Tempo por etapa de espera | Não medido | Disponível no quadro desde a Fase 0 |
