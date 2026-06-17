# PRD — Contabilidade (próximas fases)

> Estado atual (concluído): **módulo Contabilidade** com plano de contas contábil
> (`ContaContabil`): natureza devedora/credora, grupos 1‑Ativo / 2‑Passivo /
> 2.3‑Patrimônio Líquido / 3‑Resultado, hierarquia sintética × analítica, seed
> do plano padrão e conta analítica por **cliente** (1.1.2) e por **fornecedor**
> (2.1.1). Estoque é sintético (1.1.3). A classificação **gerencial** passou a ser
> exclusivamente Natureza Financeira (CategoriaFinanceira foi removida).

Este documento descreve as fases seguintes, que transformam o plano de contas em
uma contabilidade de fato (partidas dobradas) e entregam os relatórios contábeis.

## Objetivo
Registrar todos os fatos econômicos do ERP em **partidas dobradas** (débito =
crédito) sobre o plano de contas contábil, de forma **automática** a partir dos
eventos que já existem (vendas, compras/recebimentos, baixas financeiras,
movimentações de estoque, transferências), e disponibilizar **Razão, Balancete,
DRE e Balanço Patrimonial**. A contabilidade é **derivada** dos eventos
operacionais — o usuário não digita lançamento contábil no dia a dia.

## Princípios
- **Partida dobrada**: todo lançamento tem ≥1 débito e ≥1 crédito, soma de
  débitos = soma de créditos. Validado em transação.
- **Idempotência / rastreabilidade**: cada lançamento contábil guarda a origem
  (`origemTipo` + `origemId`) para não duplicar e permitir estorno.
- **Estorno, não exclusão**: cancelar um fato gera lançamento de estorno
  (inverte débito/crédito), preservando a trilha.
- **Competência**: lançamento datado pela competência do fato (emissão/entrega
  conforme o tipo), independente do caixa.
- **Empresa única** por ora (id `emp_tramontin`), mas tudo escopado por empresa.

---

## Fase C — Lançamentos contábeis (partidas dobradas)

### Modelo de dados
```prisma
model LancamentoContabil {
  id          String   @id @default(cuid())
  empresaId   String   @default("emp_tramontin")
  data        DateTime            // data de competência
  historico   String
  origemTipo  OrigemLancamento    // VENDA | RECEBIMENTO | COMPRA | PAGAMENTO | ESTOQUE | TRANSFERENCIA | MANUAL | ESTORNO
  origemId    String?             // id do fato gerador (pedido, conta, movimentação…)
  estornoDeId String?  @unique    // se for estorno, aponta o lançamento original
  partidas    PartidaContabil[]
  createdAt   DateTime @default(now())
  @@unique([empresaId, origemTipo, origemId]) // evita duplicar o mesmo fato
  @@index([empresaId, data])
}

model PartidaContabil {
  id          String          @id @default(cuid())
  lancamentoId String
  contaId     String          // ContaContabil ANALÍTICA (aceitaLancamento=true)
  tipo        TipoPartida     // DEBITO | CREDITO
  valor       Decimal         @db.Decimal(15,2)
  clienteId   String?         // razão auxiliar (quando a conta é de clientes)
  fornecedorId String?        // razão auxiliar (quando a conta é de fornecedores)
  lancamento  LancamentoContabil @relation(...)
  conta       ContaContabil      @relation(...)
  @@index([contaId]); @@index([lancamentoId])
}
```

### Motor de lançamento (`lib/contabilidade.ts`)
- `registrarLancamento({ data, historico, origemTipo, origemId, partidas[] })`
  valida débito=crédito, garante idempotência por `(origemTipo, origemId)`, grava
  em transação. `estornar(lancamentoId)` cria o inverso.
- Helpers para resolver a conta analítica de um cliente/fornecedor
  (reusar `lib/conta-contabil.ts`) e contas-padrão configuráveis
  (Caixa/Bancos, Estoques, Receita de Vendas, CMV, Fornecedores, etc.).

### Eventos a contabilizar (matriz débito/crédito)
| Evento (origem) | Débito | Crédito |
|---|---|---|
| Venda faturada (ContaReceber criada) | 1.1.2 Clientes (analítica do cliente) | 3.1 Receita de Vendas |
| Baixa estoque na venda (CMV) | 3.2 Custos (CMV) | 1.1.3 Estoques |
| Recebimento (baixa CR) | 1.1.1 Caixa/Bancos (conta do recebimento) | 1.1.2 Clientes (analítica) |
| Entrada de compra (ContaPagar/recebimento) | 1.1.3 Estoques | 2.1.1 Fornecedores (analítica) |
| Pagamento (baixa CP) | 2.1.1 Fornecedores (analítica) | 1.1.1 Caixa/Bancos |
| Transferência entre contas | 1.1.1 Conta destino | 1.1.1 Conta origem |
| Despesa avulsa (lançamento) | 3.3 Despesas (conta) | 1.1.1 Caixa/Bancos |

> A conta analítica de Caixa/Bancos por ContaBancaria e as contas de
> Receita/CMV/Despesa por Natureza Financeira serão mapeáveis (config inicial +
> seed). Onde a natureza já existe, criar de‑para Natureza→ContaContábil.

### Integração com o código existente
Disparar `registrarLancamento` nos pontos onde os fatos ocorrem hoje
(reaproveitando os fluxos já existentes — ver [[fluxos-venda-recebimento]]):
criação de CR/CP, baixa (`baixar-lote`, `[id]` de CR/CP), movimentação de estoque
de venda, transferências e lançamentos avulsos. Sempre best‑effort + idempotente.

### Backfill
Comando/endpoint para gerar lançamentos retroativos a partir dos títulos e
movimentações já existentes (idempotente pela chave de origem).

---

## Fase D — Razão e Razão Auxiliar
- **Razão da conta**: extrato de uma `ContaContabil` (débitos, créditos, saldo
  acumulado) num período.
- **Razão auxiliar**: para 1.1.2 Clientes e 2.1.1 Fornecedores, saldo e
  movimentação por entidade (usa `clienteId`/`fornecedorId` das partidas).
- UI: `/contabilidade/razao` com seletor de conta/entidade e período; export PDF/CSV.

## Fase E — Balancete de Verificação
- Por período: saldo inicial, débitos, créditos, saldo final de **todas** as
  contas, com totalização por grupo. Verifica que ΣDébitos = ΣCréditos.
- UI: `/contabilidade/balancete` (árvore com saldos), export.

## Fase F — DRE (Demonstração do Resultado)
- A partir do grupo **3 Resultado**: Receitas − Custos − Despesas = Resultado do
  período. Comparativo entre períodos.
- UI: `/contabilidade/dre`.

## Fase G — Balanço Patrimonial
- Ativo (1) × Passivo (2) + Patrimônio Líquido (2.3); apuração do resultado do
  exercício transferida para PL (3 → 2.3 Lucros/Prejuízos Acumulados).
- **Fechamento de período**: lançamento de encerramento que zera contas de
  resultado contra o PL; trava lançamentos no período fechado.
- UI: `/contabilidade/balanco`.

---

## Considerações transversais
- **Idempotência de migrations** (ver [[db-migrations-idempotentes]]): novos
  modelos via migration idempotente; nunca `db push` em prod.
- **Permissões**: novos recursos sob o módulo `contabilidade` em `modules.ts`.
- **Performance**: índices por `(empresaId, data)` e `contaId`; saldos podem ser
  materializados por período se o volume crescer.
- **Configuração de contas‑padrão**: tela simples de‑para (Natureza/Banco →
  ContaContábil) para o motor saber onde lançar.

## Faseamento sugerido
1. **C** (motor + modelo + eventos principais: venda/recebimento/compra/pagamento) — maior esforço.
2. **D** (razão) — entrega valor rápido em cima de C.
3. **E** (balancete).
4. **F** (DRE) e **G** (Balanço + fechamento).

## Critérios de aceite (Fase C)
- Toda venda/compra/baixa gera lançamento balanceado e idempotente.
- Reprocessar o backfill não duplica lançamentos.
- Cancelamento de um fato gera estorno (não apaga).
- Balancete (após C+E) fecha: ΣDébitos = ΣCréditos.
