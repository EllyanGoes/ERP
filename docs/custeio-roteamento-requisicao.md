# Roteamento do consumo de material (PEP-MD / CIF / Despesa)

Este documento descreve a **regra de negócio** que decide, para cada Requisição de
Material (RM), **onde o consumo é contabilizado**: absorvido no custo do produto
(PEP) ou lançado como despesa do período. A lógica viva está em
`src/lib/pcp/rotear-requisicao.ts` (função pura, com testes) e é acoplada em
`contabilizarRequisicao` (`src/lib/contabilidade.ts`). Ver também
[Lançamentos contábeis padrão](contabilidade-lancamentos-padrao.md).

## Por que isso existe

A empresa usa **custeio por absorção**: o custo do produto acabado é formado por
**Material Direto (MD) + Mão de Obra Direta (MOD) + Custos Indiretos de Fabricação
(CIF)**, acumulados na conta **PEP — Produto em Processo** (`1.1.3.0005`) e baixados
para Produto Acabado na conclusão, e para CPV na venda.

O problema que essa regra resolve: o consumo de material via RM ia **todo** para a
despesa **Consumo de Materiais** (`3.3.9001`). Com isso, o material que deveria
**entrar** no PEP nunca o debitava — a produção só **creditava** o PEP (saída de
acabado), deixando a conta **negativa** e o custo do produto **incompleto**.

## A decisão: o que é o item × onde foi consumido

O destino é decidido por **duas perguntas**, sem digitação manual no caso comum:

1. **O que é o item?** (cadastro do produto)
2. **Onde está sendo consumido?** (centro de custo da RM)

### Precedência (função `rotearDestinoRequisicao`)

| # | Condição | Destino | Conta |
|---|---|---|---|
| 1 | Item é **material direto**: `categoria ∈ {MATERIA_PRIMA, INSUMO, EMBALAGEM}` **e** `compoeCusto = true` | **PEP-MD** | `1.1.3.0005.0001` |
| 2 | RM tem **natureza marcada como CIF** (escape manual) | **CIF** | `1.1.4.0001` |
| 3 | Item **indireto de fábrica** (`fabril = true`) consumido em **centro fabril** | **CIF** | `1.1.4.0001` |
| 3 | Item indireto consumido em **centro não-fabril** | **Despesa** | `3.3.9001` |
| 3 | Item indireto **sem centro de custo** | **INDEFINIDO** → lançado como Despesa **+ aviso no log** | `3.3.9001` |
| 4 | Qualquer outro caso | **Despesa** (default seguro) | `3.3.9001` |

> **Regra 1 vence tudo:** material que compõe o produto vai sempre para o PEP-MD,
> independentemente do centro — nunca é ambíguo. O centro de custo só desempata o
> **indireto** (CIF de fábrica vs. despesa administrativa).

### Lançamentos gerados

- **PEP-MD:** `D 1.1.3.0005.0001 PEP-MD  /  C Estoque (local)`
- **CIF:** `D 1.1.4.0001 CIF a Apropriar  /  C Estoque (local)` — apropriado ao
  PEP-CIF (`1.1.3.0005.0003`) no fechamento.
- **Despesa:** `D 3.3.9001 Consumo de Materiais  /  C Estoque (local)`

Cada RM gera **um lançamento por destino** (origens distintas `reqId`, `reqId#pep`,
`reqId#cif`), idempotente por `(empresa, ESTOQUE_CONSUMO, origemId)`. O motor de
partidas (`registrarLancamento`) **não é alterado** — a regra apenas escolhe a conta.

## Cadastro que governa a regra

### Item (`Item`)
- `categoriaEstoque` — `MATERIA_PRIMA`, `INSUMO`, `EMBALAGEM` (direto, → PEP-MD);
  `ALMOXARIFADO`, `FERRAMENTAS`, `COMBUSTIVEL` (indireto).
- `compoeCusto` — `true` = entra no custo do produto.
- `fabril` — `true` = consumível **indireto de fábrica** (peça de manutenção,
  lubrificante, EPI, solda, refratário). O destino (CIF × Despesa) depende do centro.

### Centro de Custo (`CentroCusto`)
- `fabril = true` → consumo indireto ali vira **CIF**.
- `fabril = false` → consumo indireto ali vira **Despesa**.

Grupos cadastrados:

| Grupo | `fabril` | Exemplos |
|---|:--:|---|
| **Produtivos** | true | Preparação de Massa, Extrusão, Secagem, Queima, Classificação |
| **Auxiliares de Produção** | true | Manutenção Mecânica/Elétrica, Utilidades, Movimentação Interna/Pátio, Almoxarifado de Fábrica, Laboratório, PCP, Supervisão |
| **Não-Fabris** | false | Diretoria, Financeiro, Compras, RH, TI, Comercial, Marketing, **Expedição/Frota**, Faturamento |

## Casos de borda decididos (política)

- **Extração de Argila / Jazida — NÃO é centro de CIF** (`fabril = false`). A argila
  entra como **matéria-prima já custeada** (custo da jazida/extração embutido no preço
  da argila, custeado por caçamba). Tratá-la também como centro fabril **contaria o
  custo de extração duas vezes**. Regra: *ou* a extração compõe o custo da argila (MD)
  *ou* é um centro fabril de CIF — **nunca as duas**. Modelo adotado: **MD**.
- **Expedição / Frota de Entrega — Despesa**, não CIF. Frete de entrega ao cliente é
  **despesa de venda**, não custo do produto. Movimentação **interna** entre estágios
  é outro centro (Movimentação Interna / Pátio, esse sim fabril).

## Coleta na requisição

O formulário de requisição (`RequisicaoCreateForm.tsx`) coleta o centro de custo no
**cabeçalho** e **por item** (o item vence o cabeçalho). Para item `fabril`, o centro
é **obrigatório** (bloqueio no save + aviso por linha) — sem ele, o indireto não tem
como ser classificado e cairia em Despesa.

## Escopo e pendências

Esta regra cobre o **MD (material direto)** e o **CIF de materiais**. Para o PEP fechar
por completo (deixar de ser negativo), ainda faltam os outros componentes da absorção:

- **MOD** — folha de pagamento → `D PEP-MOD (1.1.3.0005.0002)`.
- **CIF (apropriação)** — `1.1.4.0001 CIF a Apropriar` → `D PEP-CIF (1.1.3.0005.0003)`
  no fechamento.
- **Requisições históricas** sem centro de custo: o indireto delas permanece em Despesa
  (sinalizado) até receberem um centro.

Reprocessar com **"Gerar retroativos"** (Diário Contábil) reclassifica o histórico
conforme estas regras.
