# Relatório — Produtos com saldo negativo em estoque

**Data:** 17/06/2026 · **Banco:** produção (Supabase `ERP`) · **Empresa:** emp_tramontin

## 1. Itens com saldo negativo (10 itens)

| Código | Descrição | Local | Saldo | Un. base | Conversão cadastrada | Provável causa |
|---|---|---:|---:|---|---|---|
| PROD-0078 | BV 09x19x29 — TIJOLÃO | Almoxarifado | **−10.000** | UN | PLT = 325 UN | Entrada/saída em unidades diferentes (PLT × UN) |
| PROD-0079 | BV 09X14X19 — TIJOLINHO | Almoxarifado | **−1.000** | UN | PLT = 504 UN | Idem (PLT × UN) |
| PROD-0084 | CIMENTO NASSAU | Produto Acabado | **−945** | UN | — (só UN) | Saída sem entrada equivalente |
| PROD-0091 | OLEO GT INDUS DRILL ISO 220 | Almoxarifado | **−95** | LT | BL = 20 LT | Entrada/saída em unidades diferentes (BL × LT) |
| PROD-0002 | Serragem Fina | Estoque de Insumos | **−65,5** | M³ | — | Consumo (RM) > entradas (DE) |
| PROD-0016 | DISCO DE CORTE 7" | Almoxarifado | **−32** | UN | — (só UN) | Saída sem entrada (DE-0144 PC: 12 Und) |
| PROD-0130 | PALETE DE TIJOLO | Produto Acabado | **−22** | UN | — | Saída sem entrada |
| PROD-0124 | PALETE CIMENTO | Produto Acabado | **−11** | UN | nenhuma unidade | Saída sem entrada |
| PROD-0066 | TONER BROTHER TN 2370/2540 | Almoxarifado | **−1** | UN | nenhuma unidade | Saída sem entrada |
| PROD-0312 | TELA CIRANDA CAFÉ | Almoxarifado | **−1** | UN | — | Saída sem entrada |

## 2. Causas confirmadas

### a) Conversão de unidades
Os itens com os maiores negativos têm **mais de uma unidade cadastrada** (ex.: TIJOLÃO base UN com PLT=325, ÓLEO base LT com BL=20). Quando a **entrada** é lançada numa unidade e a **saída** noutra sem a conversão correta, o saldo desanda. Agravantes:
- **Nenhuma movimentação grava `unidadeId`** (todas null em produção) — não dá para auditar em que unidade cada lançamento foi feito.
- Itens que fisicamente são vendidos/comprados em caixa/palete/barril estão com **base UN** e fatores incompletos (`fatorConversao` nulo em várias linhas, ex.: PROD-0128 PREGO C/CB 1.1/2 → CX=20 mas KG sem fator).

### b) Material cadastrado em duplicidade
| Mantido (canônico) | Duplicado | Situação do duplicado |
|---|---|---|
| PROD-0062 OXIGÊNIO (25/05, 6 movs) | **PROD-0241 GAS OXIGENIO 10M** (09/06) | saldo 11, 2 movs — precisa decidir qual fica |
| PROD-0129 PREGO C/CB 2.1/2 (29/05, 24 movs, saldo 6) | **PROD-0320 PREGO 2.1/2X11** (17/06) | 0 movs, 0 saldo — seguro inativar/excluir |

## 3. Ações recomendadas

1. **Corrigir os 10 saldos via inventário** (módulo Inventário de Material), lançando a contagem física real de cada item. Os negativos não devem ser zerados às cegas — precisam da contagem real.
2. **Consolidar os duplicados**: inativar PROD-0320 (sem movimento) e decidir o destino de PROD-0241 vs PROD-0062 (mover o saldo 11 para o canônico).
3. **Completar o cadastro de unidades/fatores** dos itens vendidos em caixa/palete/barril e passar a gravar `unidadeId` nas movimentações.
4. **Bloquear saída sem saldo** (ver decisão pendente) para impedir novos negativos.
