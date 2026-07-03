# PRD — Módulo RH / Folha de Pagamento

> Status: aprovado (planejamento). Implementação pendente.

## 1. Contexto e objetivo

Todo fechamento, o RH gera a folha em **PDF** (folha Senior, ~10 páginas, detalhada por colaborador:
proventos, descontos, INSS/IRRF/FGTS, líquido). Hoje é lançado à mão.

Objetivo: **subir o PDF → o sistema apura os dados (IA) → o usuário classifica cada colaborador
(MOD/MOI/admin) → o sistema contabiliza** a apropriação e cria as Contas a Pagar das obrigações,
liquidadas no vencimento.

O **rateio do custo é definido pela classificação de cada colaborador no cadastro** (não pelo tipo de
despesa): MOD → PEP-MOD; MOI → CIF a Apropriar (segue o fluxo de CIF, apropriando ao PEP-CIF no
fechamento da produção); admin → Despesa. A `NaturezaFinanceira` roteia cada parcela ao destino.

**Decisões confirmadas:** extração por **IA (Claude)** com tela de revisão; liquidação via **Contas a
Pagar**; **encargos patronais (INSS patronal + FGTS) vêm no próprio PDF**.

## 2. Fluxo do usuário

1. **Upload** do PDF (RH → Folhas → Nova). Arquivo no Vercel Blob (padrão `@vercel/blob`). Cria
   `FolhaPagamento` (status `EM_REVISAO`).
2. **Extração IA**: rota server envia o PDF (document block) ao Claude com schema JSON → cabeçalho
   (competência, data de pagamento, CNPJ) + por colaborador (matrícula, nome, cargo, bruto, líquido,
   INSS retido, IRRF, FGTS, INSS patronal, outros descontos). Persiste em `FolhaItem`.
3. **Revisão + classificação**: o sistema casa cada item a um Colaborador (matrícula/CPF/nome) e traz a
   classificação padrão do cadastro; o usuário confirma/edita classificação (MOD/MOI/ADMIN) e valores.
   Validação de fechamento (Σ bruto = líquido + retenções).
4. **Fechar folha** (`FECHADA`): posta a **apropriação** (lançamento composto idempotente) e gera as
   **Contas a Pagar** (líquido por colaborador, INSS, IRRF, FGTS), já apropriadas (sem re-provisão).
5. **Liquidação** no vencimento: paga as Contas a Pagar pelo fluxo normal → D passivo / C banco.

## 3. Modelo de dados (Prisma; migrations idempotentes via MCP, sem `db push`)

- `enum ClassificacaoCusto { MOD MOI ADMIN }`.
- `Colaborador.classificacaoCusto ClassificacaoCusto?` — padrão (editável na folha).
- `FolhaPagamento` — empresaId, competencia (1º dia do mês), dataPagamento, dataVencimento, arquivoUrl,
  arquivoNome, status (EM_REVISAO|FECHADA|CANCELADA), totais (bruto, líquido, INSS retido, INSS
  patronal, IRRF, FGTS), lancamentoId?, criadoPor.
- `FolhaItem` — folhaId, colaboradorId?, matricula, nome, cargo?, classificacao, bruto, liquido,
  inssRetido, inssPatronal, irrf, fgts, outrosDescontos (Json).
- `ContaPagar.semProvisao Boolean @default(false)` — quando true, `contabilizarTituloPagar` posta **só
  a liquidação** (a provisão veio da folha).

## 4. Plano de contas a adicionar (idempotente, por empresa — padrão `CONTAS_SISTEMA_*`)

`CONTAS_SISTEMA_FOLHA` + `garantirContasFolha(empresaId)` em `src/lib/conta-contabil.ts`:
- `2.1.6` Salários a Pagar (sintética; já é pai das analíticas por colaborador via
  `garantirContaColaboradorNaEmpresa` → `2.1.6.NNNN`).
- `2.1.7` INSS a Recolher · `2.1.8` IRRF a Recolher · `2.1.9` FGTS a Recolher.
- `2.1.10` Consignados/Outros a Repassar. *(códigos a confirmar contra o seed.)*

Reuso: `1.1.3.0005.0002` PEP-MOD, `1.1.3.0005.0003` PEP-CIF, `1.1.4.0001` CIF a Apropriar.

**Naturezas** (idempotentes): `mao_obra_direta` (→ PEP-MOD), `mao_obra_indireta` (`cif=true` → CIF a
Apropriar), `mao_obra_admin` (→ despesa). A classificação do colaborador escolhe a natureza.

## 5. Contabilização (reusa `registrarLancamento`)

Novo `OrigemLancamento.FOLHA_PAGAMENTO`. `contabilizarFolha(folhaId)` (`src/lib/folha.ts`),
`origemId = folhaId`. Custo do empregador por colaborador = bruto + INSS patronal + FGTS.

**Apropriação** (lançamento composto; débitos agregados por classificação):
```
D PEP-MOD (1.1.3.0005.0002)                          Σ custo dos MOD
D CIF a Apropriar (1.1.4.0001, nat. mao_obra_indireta)  Σ custo dos MOI
D Despesa Adm/Comercial (3.x)                        Σ custo dos ADMIN
  C Salários a Pagar (2.1.6.NNNN por colaborador)    líquido de cada um
  C INSS a Recolher (2.1.7)                          Σ INSS retido + Σ INSS patronal
  C IRRF a Recolher (2.1.8)                          Σ IRRF
  C FGTS a Recolher (2.1.9)                          Σ FGTS
  C Consignados/Outros a Repassar (2.1.10)           Σ outros descontos
```
Σ débitos = Σ créditos. A MOI fica em CIF a Apropriar e segue o fluxo `apropriarCifAoPep` (→ PEP-CIF).

**Liquidação** (via Contas a Pagar com `semProvisao=true`): 1 CP por colaborador (líquido,
`beneficiarioTipo=COLABORADOR`, passivo 2.1.6.NNNN) + 1 CP INSS + 1 CP IRRF + 1 CP FGTS. Pagamento pelo
fluxo normal → `contabilizarTituloPagar` posta só D passivo / C banco.

## 6. Extração por IA (Claude)

- Dep nova `@anthropic-ai/sdk`; env `ANTHROPIC_API_KEY`. Modelo default `claude-sonnet-4-6`
  (custo/precisão); **revisão humana obrigatória** antes de contabilizar.
- `POST /api/rh/folhas/[id]/extrair`: lê o PDF do Blob, envia como document block + prompt com schema
  JSON estrito, valida (Σ bate) e grava `FolhaItem`.

## 7. Arquivos a criar/alterar

- `prisma/schema.prisma` + migration `*_rh_folha`.
- `src/lib/conta-contabil.ts` (`CONTAS_SISTEMA_FOLHA`, `garantirContasFolha`).
- `src/lib/folha.ts` (extração Anthropic, `contabilizarFolha`, geração das CP).
- `src/lib/contabilidade.ts` (`contabilizarTituloPagar` respeita `semProvisao`).
- `src/app/api/rh/folhas/route.ts`, `/[id]/route.ts`, `/[id]/extrair/route.ts`, `/[id]/fechar/route.ts`
  (`requireModulo("rh")`).
- `src/app/(erp)/rh/folhas/...` (lista, nova/upload, detalhe revisão/classificação/fechar).
- `src/components/layout/Sidebar.tsx` (módulo `rh`), `src/lib/route-registry.ts`, permissão `"rh"`.
- Reuso: `@vercel/blob`, `garantirContaColaboradorNaEmpresa`, `registrarLancamento`, fluxo de `ContaPagar`.

## 8. Verificação

1. `npx tsc --noEmit` sem erros novos (baseline 8). Migration idempotente local + prod (MCP).
2. Subir o PDF real (`Folha de Pagamento 05 2026`): extração traz todos os colaboradores; Σ bate com a
   página de totais.
3. Classificar e **Fechar**: lançamento de apropriação com Σ débito = Σ crédito; débitos por
   classificação corretos; créditos = líquido + retenções.
4. Contas a Pagar geradas com vencimento certo; pagar uma posta só D passivo / C banco.
5. Parcela MOI em CIF a Apropriar, apropriada ao PEP-CIF pelo fluxo de CIF.

## 9. Fora de escopo (fases futuras)

- Cálculo próprio de encargos (virão do PDF) e e-Social.
- Mapeamento fino por rubrica (v1: totais por colaborador + outros descontos agregados).
- Provisão de férias/13º; rateio por centro de custo dentro de cada classificação.
