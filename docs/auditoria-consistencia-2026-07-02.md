# Auditoria de consistência — regras financeiras/contábeis e fluxos de processo

> **STATUS (2026-07-02, mesma data):** correções aplicadas na sequência da auditoria.
> Todos os CRÍTICOS (C1–C7) e os ALTOS foram corrigidos; decisão adicional do usuário
> implementada: **ContaReceber nasce na ENTREGA/RETIRADA — inclusive parcial, por
> minuta** (`faturarEntregasPedido`, modelo catch-up), não mais na confirmação do
> pedido. Helpers novos:
> `baixarEstoqueVenda`, `baixarTitulo`, `criarConferenciaDePedido`, máquina de status
> compartilhada de pedido de venda. Migration `20260702100000` (enum DEVOLUCAO,
> renumeração 3.3.9005/9006, campos de devolução). Backfill em
> `scripts/backfill-consistencia.ts` — **rodado no banco local**; em prod: deploy
> (aplica a migration no build) e rodar o script.
> Pendências deliberadas: CHECK `quantidadeAtual>=0` (exige zerar negativos antes),
> desconto na baixa de título, espelho contábil de transferências/OFX/avulso,
> status VENCIDA (falta job), CMPM histórico distorcido (revisão manual),
> consolidação da família `garantirConta*` e tabela de pendências pós-commit
> (substituíram-se os `.catch(() => {})` por logs).

**Data:** 2026-07-02 · **Escopo:** motor contábil, financeiro (CR/CP/caixa), fluxos operacionais (venda/compra/estoque), custeio/PCP. Auditoria feita por 4 agentes em paralelo verificando os invariantes documentados do projeto contra o código real.

**Veredito geral:** o núcleo contábil é sólido — toda criação de lançamento passa por `registrarLancamento` (validação de balanceamento, período fechado, numeração LC-), conta de estoque vem do local, contrapartida por natureza está correta, TES nunca decide destino, custo por empresa só via lib. Os problemas estão nas **bordas**: rotas que reimplementam lógica de lib (e divergem), efeitos contábeis pós-commit com erro engolido, deletes que não revertem tudo, e corridas por falta de guard otimista.

---

## CRÍTICOS

### C1. Aprovação de compras é bypassável
- `POST /api/suprimentos/pedidos-compra` (route.ts:85-97) cria pedido de compra direto, sem consultar `aprovadorPedidoCompras()`; qualquer usuário com módulo compras. Ainda move a SC para EM_PEDIDO (:230-237).
- Webhook Telegram aprova sem validar quem clicou: `webhooks/telegram/route.ts:201-262` não compara `cq.from.id` com o aprovador — agravado porque `submeter-aprovacao` manda os botões para o GRUPO quando o aprovador não tem DM.
- `cotacoes/[id]/status/route.ts:43-59` permite EM_ANALISE→CONCLUIDA manual sem aprovação.

### C2. Duas rotas de status de pedido de venda, divergentes
- `PATCH /api/pedidos-venda/[id]` (route.ts:416-551): sem máquina de estados (permite CANCELADO→CONFIRMADO), **cancela COM reversão total mas confirma SEM gerar CR**. Usada pelo kanban (`page.tsx:608`).
- `PATCH /api/pedidos-venda/[id]/status` (route.ts:48-111): tem máquina e gera CR, mas **cancela SEM reverter nada**. Usada pelo detalhe (`PedidoDetail.tsx:464`).
- Efeito: confirmar pelo kanban não fatura; cancelar pelo detalhe não estorna.

### C3. Devolução de venda não tem contabilização nenhuma
Achado convergente de 3 auditores (`comercial/devolucoes/route.ts`):
- Nenhum lançamento contábil: receita, CPV e CR originais permanecem intactos no razão; os movimentos carregam `pedidoVendaItemId` então `contabilizarLoteMovimentacao` os exclui. O cron de reconciliação acaba classificando a entrada como "Sobra" (C 3.1.9001).
- Estoque volta valorado a **preço de venda** (`valorUnitario: precoUnit`, :63-67), não ao custo; CMPM não é tocado.
- Estorno em dinheiro sem checar se o pedido foi pago e sem abater a CR (:119-126) — venda a prazo aberta + devolução = dinheiro devolvido e cobrança viva.
- `reverterMovimentosTriangulares` roda pós-commit com erro engolido (venda-ordem.ts:385-388) apesar do docstring prometer "na própria transação".
- Crédito de cliente: `consumirCreditoCliente` é read-then-write sem lock (credito-cliente.ts:19-44) — dois PDVs gastam o mesmo vale.
- Validação de quantidade já-devolvida fora da transação e compara com o vendido, não com o entregue (:46-68).

### C4. Colisão de código de conta 3.3.9004 (3 contas disputam o mesmo código)
`conta-contabil.ts` — `garantirContaDespesaFallback` (:561), `garantirContaJurosMultasPassivos` (:626) e `garantirContaPerdaBaixaImobilizado` (:494) fazem get-or-create pelo MESMO código "3.3.9004". Quem roda primeiro cria; os outros recebem a mesma conta com nome alheio — juros, perdas de imobilizado e despesas gerais colapsam numa linha do razão. Renumerar + migration de dados.

### C5. DELETEs que deixam órfãos no razão
- DELETE de cotação/SC (`cotacoes/[id]/route.ts:96-113`, `necessidades/[id]/route.ts:126-149`): `reverterEExcluirConferencias` não reverte lançamentos nem ContaPagar, e nenhum caller compensa → `D Estoque / C Fornecedor` órfão + títulos soltos (FK SetNull).
- DELETE de pedido de compra por ADMIN em qualquer status (`pedidos-compra/[id]/route.ts:216-224`): CP vira "avulso" → na próxima recontabilização `ehCompraEstoque` flipa e a despesa é gerada **em duplicidade** com o crédito da entrada.
- DELETE de parcelamento (`financeiro/parcelamentos/[grupoId]/route.ts:15-24`): checa só LancamentoFinanceiro, não contábil — provisões VENDA/COMPRA ficam órfãs.
- DELETE de conta do plano (`plano-contas/[id]/route.ts:26-44`): não checa partidas; como o banco não tem FK em `PartidaContabil.contaId`, partidas ficam apontando para conta inexistente.

### C6. Guard de saldo negativo ausente em todo o fluxo de venda, PCP e venda à ordem
Só requisição de material usa `assertSaldoNaoNegativo`. Fora do guard: balcão (`balcao/route.ts:325-329`), entregar-balcao, concluir-com-saida, minuta marcar-saída/edição, venda à ordem (venda-ordem.ts:80-113), PCP (`wip-estoque.ts:151-154` — e é read-then-write, corrida), estorno de OP (negativa PA já vendido), edição/DELETE de movimentação. Movimentação manual valida FORA da `$transaction` (TOCTOU, `suprimentos/movimentacoes/route.ts:80-99`). O CHECK no banco (backstop documentado) segue inexistente.

### C7. Compensação (encontro de contas) sem guard — dupla baixa possível
`compensacoes/[id]/confirmar/route.ts` — status RASCUNHO checado fora da tx (:38), update final incondicional (:173-176), saldos lidos fora da tx, updates de `valorPago` sem guard otimista. Duplo clique = dupla baixa e transitória que não zera. Mesmo padrão no estornar. Corrigir com `updateMany({where:{id, status:"RASCUNHO"}})` como 1º statement da tx (padrão que a baixa unitária já usa).

---

## ALTOS

### Financeiro
- **A1. Juros/multa da baixa vão para o razonete do Fornecedor/Cliente**, sem conta de resultado: o caixa soma `valorMulta+valorJuros` (`contas-pagar/[id]/route.ts:160-167`), mas o pagamento debita Fornecedores pelo total — o fornecedor só foi creditado pelo original → razonete negativo pelos juros. Espelho no CR. As contas de Juros Ativos/Passivos já existem (só o fluxo de compensação usa). Reusar `garantirContaJurosMultas*` na baixa.
- **A2. `baixar-lote` não contabiliza nem recomputa status** (`financeiro/baixar-lote/route.ts:19-71`): marca PAGA e cria caixa, sem `recontabilizarTitulo*`, sem recompute do pedido, sem trava `formaEletronicaNoCaixa`, e com corrida que duplica caixa.
- **A3. Balcão sobre título PARCIAL** sobrescreve `valorPago` com `valorOriginal` e distribui caixa pelo total, não pelo saldo (`balcao/route.ts:371-409`) → Σ caixa > título.
- **A4. Recorrência** gera título sem contabilização e com corrida de dupla geração (`recorrencias/[id]/gerar/route.ts:14-18`).
- **A5. Estorno de CP incompleto**: não chama `recomputarStatusFinanceiroCompra` (o espelho CR chama o recompute); estorno de PA já liquidado por entrada deixa o crédito de Adiantamento sem lastro.
- **A6. PUT admin de título**: edita `valorOriginal` sem recomputar status, permite trocar `clienteId` de CR de pedido (fura "título segue cliente"), apaga contábil fora de tx.
- **A7. Caixa sem espelho contábil**: lançamento avulso, transferências entre contas, OFX e devolução criam `LancamentoFinanceiro` sem lançamento contábil — a analítica 1.1.1.x do razão nunca vai conciliar com `saldoConta`. (Confirmar se o avulso é intencional pela regra "caixa manual"; transferência entre contas deveria ter D/C entre 1.1.1.x.)

### Contábil
- **A8. Apagar lançamentos de período FECHADO não é bloqueado** (`apagarLancamentosContabeis`, contabilidade.ts:840-850): excluir documento datado em exercício encerrado altera o balanço fechado silenciosamente. `registrarLancamento` bloqueia gravar; apagar precisa do guard espelho.
- **A9. Partidas gravadas sem arredondamento** (contabilidade.ts:960, 1021-1032, 1189-1211): a validação soma floats crus mas o Postgres arredonda cada partida para Decimal(15,2) — lançamento gravado pode desbalancear em centavos. Arredondar dentro de `registrarLancamento` com resíduo na maior partida.
- **A10. Drift schema × banco**: schema declara `onDelete: Cascade` em PartidaContabil (schema.prisma:1015) mas a migration não criou FK nenhuma — um futuro `migrate dev` muda o comportamento silenciosamente. Alinhar.
- **A11. DELETE de movimentação individual** não re-sincroniza o lote contábil (`movimentacoes/[movId]/route.ts:126-172`) — lançamento do lote fica stale.

### Custeio/PCP
- **A12. Absorção MOD+CIF conta volume por ESTÁGIO** (`absorverConversaoAoEstoque`, contabilidade.ts:1418-1462): a mesma peça entra 3-4× no volume (uma ENTRADA por etapa da OP); a conversão é debitada em WIP já consumido → resíduo permanente em PEP-MD e acabado subcusteado. Agravante: `aplicarCmpmEmpresa` com saldo zero **sobrescreve** o CMPM do WIP só com conversão (sem material) — o próximo consumo usa custo corrompido. Contar volume só na entrada final.
- **A13. Taxas CIF/MOD diluídas por volume acumulado histórico**: o fix `volumeDoMes` (ce2e754) só é usado pelo `cpv-absorvido`; `custeio/aplicar`, a tela de custeio e `cpv-detalhado` chamam `calcularCusteio` sem a opção — e `aplicar` grava esse custo diluído em `ItemCustoEmpresa`/`precoCusto` (vira valoração de estoque e CPV).
- **A14. Dois motores de volume**: `calcularCusteio` só enxerga entradas MANUAIS (`ordemProducaoId: null`, custeio-cif.ts:218); quando a produção for 100% via OP, o custeio predeterminado zera com produção real acontecendo. Unificar a definição de volume.
- **A15. Estorno de OP não reverte o CMPM** aplicado pelo apontamento (`pcp/ordens/[id]/estornar/route.ts`) — reapontar aplica CMPM por cima de entrada fantasma.
- **A16. Fallback ao custo global em apropriação de razão** (`apontamento.ts:166,265,322` e `valor-estoque.ts:39`): o próprio lib documenta que fallback global é "para exibição, não para apropriar".
- **A17. PCP inteiro hardcoded em `EMPRESA_PADRAO_ID`** (apontamento.ts, wip-estoque.ts) — bomba multiempresa; derivar de `ordem.empresaId`.

### Fluxos
- **A18. Sobre-entrega sem limite**: minutas aceitam qualquer quantidade (schema só `positive`), nada compara com o pendente; `checkAndConcludePedido` conclui com `>=`. E criar minuta ressuscita pedido CANCELADO (`minutas/route.ts:173-176`).
- **A19. Server confia no client**: `valorTotal` das linhas de venda vem do client sem recomputar qtd×preço−desconto (`pedidos-venda/route.ts:139-140`); sem teto de desconto server-side; qtd 0/negativa aceita no pedido de compra; vencedor de cotação aceita qualquer `cfId`.
- **A20. Conversão de unidade perdida num dos dois caminhos**: PATCH status→RECEBIDO cria conferência sem `unidadeId`/TES/centro (`pedidos-compra/[id]/status/route.ts:83-89`) → fator=1, quantidade errada, custo inflado. O caminho `conferencias/route.ts:72-80` herda certo. Edição de pedido de compra também recria itens perdendo TES/centro/compoeCusto.
- **A21. Local de saída único ainda vivo em 2 rotas**: `entregar-balcao/route.ts:118-137` e `concluir-com-saida/route.ts:121-139` baixam tudo do local do body (o bug que `local-saida.ts` corrigiu nas outras rotas).
- **A22. Venda à ordem**: geração best-effort pós-commit com catch que só loga, sem botão/job de reprocesso; vínculo do financeiro intragrupo por `descricao contains "à ordem N"` — editar a descrição do título (feature recente) quebra o delete em cascata. Adicionar `vendaOrdemId`/origemId em CR/CP.
- **A23. DE avulsa** nasce na empresa padrão ignorando a sessão e credita Fornecedor no razão **sem gerar CP** (viola "CP = crédito da entrada"). E o invariante CP=crédito depende de `vrTotal`=Σ itens: frete/acréscimo na NF descasa CP × crédito (`concluir/route.ts:373`).

---

## MÉDIOS (selecionados)

- Corridas de CR duplicada: guard `jaTem` fora da tx em `status/route.ts:101-106` e balcão semBaixa; minuta ENTREGUE sem claim (duplica compra virtual/intragrupo). O padrão correto (claim via `updateMany`) já existe no balcão com baixa — replicar.
- Contabilização pós-commit `\.catch(() => {})` em ~10 rotas (balcão, receber, status, minutas, concluir conferência, PA de aprovação, compensação, títulos) — razão fica para trás sem log nem fila de reprocesso.
- `registrarLancamento` não aceita tx: lançamento CIF-MISTURA gravado com client global dentro de tx alheia (sobrevive a rollback); absorção aplica CMPM em tx que commita antes do lançamento.
- Movimentos CIF-MISTURA não são excluídos de `contabilizarProducaoOrdem` — hoje só não corrompe por acidente (`length < 2` → return).
- Máquina de estados ausente em ~8 documentos (PATCH genérico aceita qualquer status): pedido de compra, conferência (reconcluir DIVERGENCIA duplica estoque), inventário, minuta, SC, cotação, devolução.
- `pagamentoSchema` sem campo desconto (título com abatimento fica PARCIAL para sempre) e sem teto de overpay.
- Sentinel `"caixa-geral"` não traduzido em `receber/route.ts:89` e `balcao/route.ts:170` (cai na conta da Tramontin p/ outra empresa).
- Trava categoria×local só cobre 4 rotas; escapam devolução, venda à ordem, inventário p/ cima, criação direta de EstoqueItem.
- PCP `resolveLocalInsumo` pega local de maior saldo sem checar `categoriasAceitas`.
- GETs sem `requireModulo`: pedidos-venda, minutas, conferências, pedidos-compra, cotações.
- Dimensões capex por `itemId` colapsam duas linhas do mesmo item (`contabilidade.ts:1607-1618`) — chavear por linha.
- Janela do mês: absorção usa `createdAt`, custeio usa `data` com fallback — apontamento retroativo cai em mês diferente conforme o relatório.
- Subproduto entra a valor zero no movimento mas o razão valora pelo custo-empresa → assimetria movimento×razão.

---

## Divergências código × memória/documentação (não são bugs, decidir e alinhar)

1. **Modelo de venda**: o código implementa o modelo CLÁSSICO (D Clientes / C Material a Entregar na confirmação) — que É a decisão final registrada. Mas os **docstrings** de `contabilizarVendaPedido`/`contabilizarReceitaMinuta` ainda descrevem a Opção B (Bens a Entregar), e `garantirContaBensEntregar*` são importados e nunca chamados. Limpar docstrings + código morto.
2. **Quando a CR nasce**: memória diz "auto na entrega total"; o código gera CRs na **CONFIRMAÇÃO** (`status/route.ts:99-111`). Se a mudança foi intencional (pedido unificado), atualizar a memória; senão, é regressão.
3. **CPV na venda existe** (contabilizarCmvMinuta) — memória antiga dizia que faltava. (Memória já atualizada.)
4. **Perda por vagões** é só gerencial: o custo da perda fica embutido no custo unitário das peças boas; nenhuma conta de perdas. Confirmar se é o desejado (perda anormal destacada exigiria implementação).
5. **Status `VENCIDA`** nunca é escrito — só lido em 4 lugares. Ou código morto, ou falta o job.
6. **Conciliar produção (#35)** segue pendente (nenhum código encontrado).

---

## Causas-raiz estruturais (o que gera os bugs acima)

1. **Lógica em rota em vez de lib** — baixa de estoque copiada 5×, baixa de título 4×, estorno de movimentos 3×, criação de DE 2×, `formaEletronicaNoCaixa` inline 2× (já divergiram), parcelas 2×. Cada cópia esquece um pedaço (guard, local por item, contabilização).
2. **Efeitos pós-commit com `catch` vazio** — sem fila/flag de reprocesso, a divergência contábil é silenciosa (contrasta com o padrão "reprocesso via botão").
3. **Sem guard otimista** nos pontos de corrida — o padrão correto (updateMany condicional) existe no projeto, só não foi replicado.
4. **Vínculos frágeis** — origemId sem FK (por design, ok) + matching por `descricao contains`/`documento` (frágil).
5. **Validações client-only** sem espelho no server.

## Simplificações recomendadas (em ordem de alavancagem)

1. **`baixarEstoque(tx, itens[])`** — embute `resolverLocaisSaida` + `assertSaldoNaoNegativo` + movimento; substitui as 5 cópias e fecha o C6 de uma vez. Idem `estornarMovimentos(tx, where)` para as 3 cópias. + CHECK `quantidade >= 0` no banco como backstop.
2. **`baixarTitulo(tx, ...)`** único usado por PATCH CR, PATCH CP, baixar-lote, balcão e compensação — resolve A1/A2/A3/C7 com guards e contabilização consistentes (inclui a separação de juros/multa).
3. **`reverterDocumento(tx, {origemTipos, origemIds})`** — torna "exclusão reverte em cascata" estrutural em vez de disciplina por rota (fecha C5).
4. **`registrarLancamento` aceitar tx + arredondar partidas** com resíduo na maior (elimina A9 e os ajustes manuais repetidos).
5. **Consolidar a família `garantirConta*`**: uma `garantirConta({codigo, nome, paiCodigo, ...})` + tabela declarativa de contas de sistema — reduz conta-contabil.ts em ~40% e teria evitado a colisão 3.3.9004. + módulo `CONTA = {...}` de constantes de código usado por contabilidade.ts, folha.ts, apontamento.ts, naturezas e cpv-*.
6. **Padrão único para efeitos pós-commit**: tabela de pendências + botão/job de reprocesso no lugar dos `\.catch(() => {})`.
7. **Uma rota de transição de status por documento** com tabela declarativa de transições; remover `status` dos PATCHes genéricos.
8. **Remover código morto**: `estornarLancamento`, `gerarMovimentosTriangulares`, aprovação na SC (rota + ramo do responder), imports Bens a Entregar, `empresaRevende` (valor-estoque.ts), diretório vazio `(erp)/pcp/custeio/`, transição manual de cotação, 3.2.9001 nunca lançado.
9. **Unificações menores**: `dividirReceita`≡`dividirPorNatureza` → `ratearProporcional`; pernas de banco D/C espelhadas; fórmula CMPM global inline vs lib; `saldoConta`/`saldosTodasContas`; filtro em memória de `titulosAbertosDoParceiro`; constante `26` dias em 3 lugares; regex `/-(SECO|QUEIMADO)$/` sobre código de item (frágil — slug trunca em 24 chars e pode cortar o sufixo).

---

## Confirmados consistentes (sem violação)

- Balanceamento central: só 2 pontos criam lançamento; validação de partidas, período fechado e numeração LC- ok.
- Conta de estoque vem do LOCAL em todas as pernas; nenhum resquício de conta-por-categoria.
- Contrapartida por natureza (sintética + analítica por beneficiário) correta, com desambiguação por prefixo.
- TES nunca decide destino contábil; capex lido da linha com fallback no item.
- Adiantamento a fornecedor (D 1.1.7/C Banco, liquidação na entrada com re-sync bidirecional).
- Intragrupo nunca lança caixa; venda à ordem cria só títulos ABERTA.
- Encontro de contas: transitória + reuso da baixa + resíduo ok (exceto a corrida C7).
- Baixa unitária de título tem guard otimista correto; estornos apagam contábil dentro da tx.
- CPV/CMV na venda com split por `empresa.industrializa`; CIF real (staging 1.1.4.0001 → PEP-CIF) implementado.
- Custo por empresa: zero leituras diretas de `ItemCustoEmpresa` fora do lib (20+ call sites via helpers).
- Custeio por fase fecha materiais por construção; `compoeCusto=false` respeitado em consumo e custeio; OP não dobra via lote.
- Exclusões principais (minuta, conferência direta, inventário, requisição, estorno de OP) atômicas e completas.
- Reconciliação físico×contábil pelo caminho certo; "gerar retroativos" só gera lançamentos, nunca movimentos (antipadrão ausente).
- Nenhuma divisão desprotegida encontrada nas fórmulas de custo.
