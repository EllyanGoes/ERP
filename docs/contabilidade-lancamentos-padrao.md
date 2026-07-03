# Lançamentos contábeis padrão — integração dos módulos

Este documento descreve **todos os lançamentos contábeis automáticos** que o módulo
de **Contabilidade Gerencial** gera a partir dos demais módulos do ERP (vendas,
compras, estoque, financeiro, imobilizado). Toda a lógica vive em
`src/lib/contabilidade.ts`; as contas são garantidas em `src/lib/conta-contabil.ts`.

## Como funciona

- **Partidas dobradas:** todo lançamento tem débito = crédito (validado em
  `registrarLancamento`). Convenção contábil: **D** débito, **C** crédito.
- **Idempotência por origem:** cada lançamento tem `(origemTipo, origemId)` único por
  empresa. Reprocessar não duplica — se já existe, é ignorado.
- **Hooks best-effort:** os lançamentos são disparados *pós-commit* nos fluxos de
  negócio (não bloqueiam a operação); o botão **"Gerar retroativos"** (Diário)
  reprocessa o histórico a partir dos títulos/documentos existentes.
- **Multiempresa:** cada empresa tem seu **próprio plano de contas**; tudo opera
  cross-empresa com `empresaId` explícito.
- **Inventário perpétuo:** a compra vira **Ativo (Estoque)**, não custo; o custo só
  aparece na **venda** (CMV/CPV).
- **Contas resolvidas por código** (analíticas; as sintéticas só totalizam):

| Código | Conta | Uso |
|---|---|---|
| `1.1.1.x` | Disponibilidades (por banco/caixa) | recebimentos e pagamentos |
| `1.1.2.x` | Clientes a Receber (por cliente) | direito a receber |
| `1.1.3.x` | Estoque (por local) | inventário perpétuo |
| `1.2.1.x` | Imobilizado (por bem) · `1.2.2` (−) Depreciação Acumulada · `1.2.3` Terrenos | ativo não circulante |
| `2.1.1.x` | Fornecedores a Pagar (por fornecedor) | obrigação a pagar |
| `2.1.2.x` | Material a Entregar (por cliente) | receita diferida (CPC 47) |
| `2.3.1.0001` | Capital Social · `2.3.2.0001` Lucros/Prejuízos Acumulados | patrimônio líquido |
| `3.1.9002` | Receita de Vendas (bruta) · `3.1.9003` (−) Descontos Concedidos · `3.1.9001` Sobras de Estoque | receitas/deduções |
| `3.2.1.0001` | CMV — Custo das Mercadorias Vendidas · `3.2.2.0001` CPV — Custo dos Produtos Vendidos · `3.2.9001` Custo de Produção | custos |
| `3.3.9001` Consumo · `3.3.9002` Perdas · `3.3.9003` Depreciação · `3.3.9004` Despesas Gerais | despesas |

---

## Ciclo de venda

### 1. Confirmação do pedido de venda — `VENDA`
Quando o pedido fica **CONFIRMADO / EM_AGENDAMENTO / CONCLUÍDO** (faturado ou não),
reconhece o direito a receber e a obrigação de entregar. *(`contabilizarVendaPedido`)*

| D/C | Conta | Valor |
|---|---|---|
| **D** | `1.1.2.x` Clientes a Receber (cliente) | valor total do pedido (líquido) |
| **C** | `2.1.2.x` Material a Entregar (cliente) | valor total do pedido (líquido) |

> Não lança para pedidos **intragrupo**. A **CR (faturamento)** do pedido **não**
> gera receita — vira só documento de cobrança; quem reconhece a receita é a entrega.

### 2. Entrega da minuta — `RECEITA_ENTREGA`
Quando a minuta fica **ENTREGUE**, baixa o passivo e reconhece a receita pelo valor
entregue (proporcional à fração entregue de cada item). *(`contabilizarReceitaMinuta`)*

| D/C | Conta | Valor |
|---|---|---|
| **D** | `2.1.2.x` Material a Entregar (cliente) | líquido entregue |
| **D** | `3.1.9003` (−) Descontos Concedidos | desconto do item (se houver) |
| **C** | `3.1.9002` Receita de Vendas (bruta) | bruto = líquido + desconto |

> Base autoritativa: **líquido = `valorTotal` do item**, **desconto = `valorDesconto`**,
> **bruto = líquido + desconto**. O desconto aparece na DRE em "(−) Deduções da Receita".

### 3. Custo da venda — `ESTOQUE_SAIDA` (CMV / CPV)
Na saída de estoque da minuta, baixa o estoque pelo custo. *(`contabilizarCmvMinuta`)*

| D/C | Conta | Valor |
|---|---|---|
| **D** | `3.2.1.0001` CMV (itens de revenda / mercadoria) | qtd × custo |
| **D** | `3.2.2.0001` CPV (produto acabado — **só empresa que industrializa**) | qtd × custo |
| **C** | `1.1.3.x` Estoque (local) | qtd × custo |

> Custeio: produto **acabado** valorado pelo **preço médio de venda**; demais pelo
> **CMPM**. Empresa de **pura revenda** (flag `Empresa.industrializa = false`, ex.:
> Cimento e Mix) lança **tudo em CMV**, nunca CPV.

### 4. Recebimento do título — `RECEBIMENTO`
Na baixa da conta a receber (pagamento de fato). *(`contabilizarTituloReceber`)*

| D/C | Conta | Valor |
|---|---|---|
| **D** | `1.1.1.x` Banco/Caixa **real de cada baixa** | valor pago |
| **C** | `1.1.2.x` Clientes a Receber (cliente) | valor pago |

> Só com **pagamento de fato** (`valorPago > 0`) e **nunca intragrupo**. O caixa vai
> para o **banco real** de cada baixa (do `LancamentoCaixa`), não unificado.

### Venda avulsa (CR sem pedido) — `VENDA`
Conta a receber criada sem pedido reconhece a receita direto. *(`contabilizarTituloReceber`)*

| D/C | Conta | Valor |
|---|---|---|
| **D** | `1.1.2.x` Clientes a Receber (cliente) | valor original |
| **C** | `3.1.9002` Receita de Vendas | valor original |

---

## Ciclo de compra

### 5. Entrada de estoque (conferência) — `ESTOQUE_ENTRADA`
Conferência de compra **CONCLUÍDA** (inventário perpétuo). *(`contabilizarEntradaEstoque`)*

| D/C | Conta | Valor |
|---|---|---|
| **D** | `1.1.3.x` Estoque (local) | qtd × valor unitário da NF |
| **C** | `2.1.1.x` Fornecedores a Pagar (fornecedor) | total da entrada |

### 6. Despesa avulsa (CP sem pedido de compra) — `COMPRA`
Conta a pagar de despesa (não vinculada a pedido de compra). *(`contabilizarTituloPagar`)*

| D/C | Conta | Valor |
|---|---|---|
| **D** | `3.3.x` (conta da natureza) ou `3.3.9004` Despesas Gerais | valor original |
| **C** | `2.1.1.x` Fornecedores a Pagar (fornecedor) | valor original |

> CP **de pedido de compra** (estoque) **não** gera a perna COMPRA — quem credita o
> fornecedor é a entrada de estoque (item 5). Evita dupla contagem.

### 7. Pagamento do título — `PAGAMENTO`
Na baixa da conta a pagar (pagamento de fato). *(`contabilizarTituloPagar`)*

| D/C | Conta | Valor |
|---|---|---|
| **D** | `2.1.1.x` Fornecedores a Pagar (fornecedor) | valor pago |
| **C** | `1.1.1.x` Banco/Caixa **real de cada baixa** | valor pago |

> Só com **pagamento de fato** e **nunca intragrupo**; sai do **banco real** da baixa.

---

## Movimentos de estoque (produção / consumo / inventário)

### 8. Produção (PCP) — `ESTOQUE_PRODUCAO`
Ordem de produção **CONCLUÍDA**. *(`contabilizarProducaoOrdem`)*

| D/C | Conta | Valor |
|---|---|---|
| **D** | `1.1.3.x` Estoque (local) | CMPM do acabado |
| **C** | `3.2.9001` Custo de Produção | idem |

### 9. Requisição de materiais — `ESTOQUE_CONSUMO`
Requisição **ATENDIDA** (consumo interno). *(`contabilizarRequisicao`)*

| D/C | Conta | Valor |
|---|---|---|
| **D** | `3.3.9001` Consumo de Materiais | CMPM consumido |
| **C** | `1.1.3.x` Estoque (local) | idem |

> Devolução (entrada de volta ao estoque) inverte as pernas.

### 10. Inventário (acerto de contagem) — `ESTOQUE_AJUSTE`
Inventário **CONCLUÍDO**. *(`contabilizarInventario`)*

| Caso | D | C |
|---|---|---|
| Sobra | `1.1.3.x` Estoque | `3.1.9001` Sobras de Estoque |
| Perda | `3.3.9002` Perdas de Estoque | `1.1.3.x` Estoque |

### 11. Lote de movimentação manual — `ESTOQUE_AJUSTE` / `ESTOQUE_TRANSFERENCIA`
*(`contabilizarLoteMovimentacao`)*

| Caso | D | C |
|---|---|---|
| Entrada | `1.1.3.x` Estoque | `3.1.9001` Sobras |
| Saída | `3.3.9002` Perdas | `1.1.3.x` Estoque |
| Transferência | `1.1.3.x` Estoque (destino) | `1.1.3.x` Estoque (origem) |

> Estoque de **terceiros** (`clienteDonoId`) é ignorado — não compõe o ativo.

---

## Imobilizado e encerramento

### 12. Depreciação do mês — `DEPRECIACAO`
Processamento mensal da depreciação (método linear). *(`contabilizarDepreciacaoMes`)*

| D/C | Conta | Valor |
|---|---|---|
| **D** | `3.3.9003` Despesa de Depreciação | parcela do mês |
| **C** | `1.2.2` (−) Depreciação Acumulada | idem |

> Bens com `deprecia = false` (terrenos / não depreciáveis) são pulados.

### 13. Encerramento do exercício — `ENCERRAMENTO`
Fecha o exercício (anual): apura **todo o grupo Resultado** e transfere o resultado
ao PL. *(`fecharExercicio`)*

| Caso | D | C |
|---|---|---|
| Lucro | contas de receita (zeradas) | `2.3.2.0001` Lucros/Prejuízos Acumulados |
| Prejuízo | `2.3.2.0001` Lucros/Prejuízos Acumulados | contas de custo/despesa (zeradas) |

> Após o encerramento, lançamentos datados dentro do exercício fechado são
> **bloqueados** (`PeriodoFechadoError`), exceto o próprio encerramento e estornos.

---

## Lançamentos não automáticos

- **`MANUAL`** — lançamento avulso feito no Diário Contábil (com usuário responsável).
- **`ESTORNO`** — lançamento inverso de um existente.
- **Saldos de abertura** (imobilizado, estoque) — lançados pontualmente, não por hook.

## Regras transversais (resumo)

1. **Intragrupo nunca lança caixa** e a venda intragrupo não gera `VENDA`.
2. **Caixa só com pagamento de fato**, sempre no **banco real** da baixa.
3. **Receita reconhecida na entrega** (competência / CPC 47), não no faturamento.
4. **Perpétuo:** compra → Ativo (Estoque); custo só na venda (CMV/CPV).
5. Toda geração é **idempotente** e **best-effort** (não bloqueia o fluxo de negócio).
