# PRD — Módulo de Gestão de Contratos

> Status: proposta (out/2026). Implementação pendente de aprovação do dono.
> Princípio central: **contrato é o vínculo entre um documento assinado (GED) e as obrigações
> financeiras e operacionais que ele gera**. O módulo não é um editor de minutas: é a camada que
> garante que nenhum prazo vence sem aviso, que nada é pago fora do combinado e que o papel
> assinado está sempre à mão.

## 1. Contexto e objetivo

Hoje os contratos do grupo (fornecimento de argila/lenha/energia, transporte, manutenção, locação
de máquinas, software, seguros, planos de saúde, contratos com clientes e com terceirizados)
existem só como PDF em pasta, cartão no Projetos ou, no melhor caso, como `Documento` no GED com
validade. Consequências reais:

- **Renovação automática silenciosa**: contratos com cláusula "renova por 12 meses salvo aviso
  com 60 dias" passam da janela de rescisão sem ninguém saber.
- **Reajuste perdido ou indevido**: o fornecedor aplica IGP-M e ninguém confere; ou o grupo
  esquece de reajustar o contrato com o cliente.
- **Pagamento fora do contrato**: o CP tem o título, mas não diz se o valor bate com a cláusula,
  se a medição foi aprovada ou se o contrato ainda está vigente.
- **Obrigações da outra parte** (CND, seguro, ART, PCMSO de terceirizado, nota de garantia)
  não são cobradas.
- Numa diligência (banco, auditoria, fiscalização do trabalho em terceirizados) a resposta
  "qual contrato ampara este pagamento?" leva horas.

**Objetivo:** um módulo que torne o grupo **previsível e auditável** em contratos, com quatro
propriedades:

1. Todo contrato tem **vigência, regra de renovação e reajuste** explícitas e o sistema avisa
   **antes** da janela de decisão, não no vencimento.
2. Todo contrato tem **o documento assinado e seus aditivos** anexados e versionados (GED).
3. O **financeiro nasce do contrato**: parcelas previstas no CP/CR, medições aprovadas, reajuste
   aplicado só em parcelas futuras; títulos fora de contrato ficam visíveis.
4. Existe um **painel** que responde "o que vence, o que reajusta, quanto está comprometido e
   com quem" em uma tela, por empresa.

**Fora do objetivo (v1):** editor de minutas/cláusulas com templates; assinatura eletrônica
embutida (fica como integração em fase posterior); gestão jurídica de litígios; contratos de
trabalho CLT (é RH).

## 2. Personas e usos

| Persona | O que precisa |
|---|---|
| Dono / diretoria | Painel: quanto está comprometido por mês e por fornecedor, o que vence nos próximos 90 dias, decisões pendentes (renovar / rescindir / reajustar). |
| Compras / Suprimentos | Cadastrar contrato de fornecimento, acompanhar medições e entregas, saber se o preço faturado respeita o contrato. |
| Financeiro | Parcelas previstas no CP/CR já classificadas (natureza, centro, conta), reajuste correto, conferir título × contrato na baixa. |
| Comercial | Contratos com clientes (fornecimento recorrente, à ordem), reajuste, vigência, inadimplência por contrato. |
| Jurídico / Administrativo | Documento assinado + aditivos, obrigações da outra parte, histórico de alterações, quem aprovou. |
| SST / RH | Terceirizados: exigir documentos de SST do contratado (NR-01 1.5.3 / 1.5.7) e cobrar vencimento. |

## 3. Conceitos

- **Contrato**: instrumento com partes, objeto, vigência, valor e regras. Tem exatamente **uma
  contraparte principal** (fornecedor **ou** cliente) e pode ter intervenientes.
- **Aditivo**: alteração de prazo, valor, objeto ou cláusula. Não substitui o contrato — cria uma
  **versão de termos** com data de efeito e um documento próprio no GED.
- **Termos vigentes**: o conjunto (valor, periodicidade, reajuste, vigência) válido numa data.
  O sistema sempre resolve "termos em dd/mm" olhando contrato + aditivos.
- **Obrigação**: compromisso de uma das partes com prazo e/ou periodicidade, com evidência
  (documento) — mesma mecânica de `SstObrigacao`.
- **Medição**: apuração periódica (mês, entrega, etapa) de um contrato "por medição/consumo" que,
  aprovada, gera o título.
- **Evento**: fato datado que o motor projeta ou registra — fim de vigência, janela de aviso
  prévio, reajuste, renovação, rescisão, vencimento de obrigação.

## 4. Modelo de dados (Prisma; migrations idempotentes, sem `db push` em produção)

Todos os modelos com `empresaId` entram em `MODELOS_ESCOPADOS` (`src/lib/prisma.ts`) e recebem
`criadoPor/atualizadoPor` pelo proxy de sessão.

### 4.1 Contrato

```prisma
model Contrato {
  id              String   @id @default(cuid())
  empresaId       String
  numero          String            // CT-0001 (sequência por empresa, sem ano — padrão CP/SC)
  titulo          String            // "Fornecimento de lenha — Madeireira X"
  tipo            TipoContrato
  lado            LadoContrato      // DESPESA (somos contratante) | RECEITA (somos contratado)
  fornecedorId    String?           // contraparte quando lado = DESPESA
  clienteId       String?           // contraparte quando lado = RECEITA
  responsavelId   String            // usuário interno dono do contrato (recebe alertas)
  centroCustoId   String?
  naturezaFinanceiraId String?      // classificação padrão dos títulos gerados
  objeto          String            // descrição livre
  status          StatusContrato    @default(MINUTA)
  // vigência
  inicio          DateTime
  fim             DateTime?         // null = indeterminado
  renovacao       TipoRenovacao     @default(NENHUMA)   // NENHUMA | AUTOMATICA | MANUAL
  renovacaoMeses  Int?              // prazo de cada renovação automática
  avisoPrevioDias Int?              // janela para rescindir antes de renovar (ex.: 60)
  // valor (termos iniciais; aditivos sobrescrevem a partir da data de efeito)
  modalidade      ModalidadeValor   // FIXO_MENSAL | FIXO_UNICO | POR_MEDICAO | POR_CONSUMO | ESTIMADO
  valor           Decimal? @db.Decimal(15,2)   // valor da parcela/total conforme modalidade
  valorTotalEstimado Decimal? @db.Decimal(15,2) // teto/estimativa (comprometido)
  periodicidade   Periodicidade?    // MENSAL | BIMESTRAL | TRIMESTRAL | SEMESTRAL | ANUAL
  diaVencimento   Int?              // dia do mês da parcela
  primeiroVencimento DateTime?
  formaPagamentoId String?
  // reajuste
  reajusteTipo    TipoReajuste      @default(NENHUM) // NENHUM | INDICE | PERCENTUAL | NEGOCIADO
  reajusteIndice  IndiceReajuste?   // IPCA | IGPM | INPC | SELIC | OUTRO
  reajustePercentual Decimal? @db.Decimal(7,4)
  reajusteMesBase Int?              // mês de aniversário (1–12)
  reajusteProximo DateTime?         // próximo reajuste projetado
  // garantias / multas (informativo, para alerta e checagem na rescisão)
  multaRescisoria String?
  garantia        String?
  // documento
  documentoId     String?           // Documento (GED) do contrato assinado
  assinadoEm      DateTime?
  observacoes     String?
  tags            String[]
  encerradoEm     DateTime?
  motivoEncerramento String?
  criadoPor String?  atualizadoPor String?
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt

  empresa      Empresa  @relation(...)
  fornecedor   Fornecedor? ... cliente Cliente? ... responsavel Usuario ...
  aditivos     ContratoAditivo[]
  obrigacoes   ContratoObrigacao[]
  medicoes     ContratoMedicao[]
  itens        ContratoItem[]
  eventos      ContratoEvento[]
  documentos   Documento[]          // Documento.contratoId (contrato, aditivos, anexos)
  contasPagar  ContaPagar[]         // ContaPagar.contratoId
  contasReceber ContaReceber[]      // ContaReceber.contratoId
  aprovacoes   AprovacaoEtapa[]     // AprovacaoEtapa.contratoId (mesmo padrão do pedido de compra)
  @@unique([empresaId, numero])
  @@index([empresaId, status, fim])
  @@index([fornecedorId]) @@index([clienteId]) @@index([responsavelId])
}
```

Regras:
- `lado` decide a contraparte obrigatória (fornecedor ↔ cliente) e em qual lado do financeiro as
  parcelas nascem (CP ou CR). Vínculo por CNPJ já existente resolve "mesma pessoa".
- `numero` segue o padrão do sistema (sequência por empresa, prefixo `CT-`, sem ano).
- Status: `MINUTA → EM_APROVACAO → VIGENTE → EM_RENOVACAO → ENCERRADO | RESCINDIDO | SUSPENSO`.
  Só `VIGENTE`/`EM_RENOVACAO` geram parcelas e alertas. `EM_APROVACAO` passa pelo fluxo de
  aprovação (§6.2).

### 4.2 Itens do contrato (opcional, para fornecimento/preço)

```prisma
model ContratoItem {
  id          String  @id @default(cuid())
  contratoId  String
  itemId      String?          // Item do almoxarifado (quando é fornecimento de material)
  descricao   String
  unidadeId   String?
  quantidade  Decimal? @db.Decimal(15,4)   // quantidade contratada (teto)
  precoUnitario Decimal @db.Decimal(15,6)
  quantidadeConsumida Decimal @default(0) @db.Decimal(15,4) // atualizada por medição/entrada
  ativo       Boolean @default(true)
}
```

Uso: contratos de fornecimento (argila, lenha, embalagem) com preço acordado. Permite dois
controles: (a) **preço da entrada × preço do contrato** no Documento de Entrada (aviso, não
bloqueio — decisão §11); (b) **saldo de quantidade**.

### 4.3 Aditivos (versões de termos)

```prisma
model ContratoAditivo {
  id            String   @id @default(cuid())
  contratoId    String
  numero        Int                     // 1º, 2º aditivo…
  tipo          TipoAditivo             // PRAZO | VALOR | OBJETO | REAJUSTE | OUTRO (pode combinar: tags)
  efeitoEm      DateTime                // data a partir da qual os novos termos valem
  descricao     String
  // campos sobrescritos (null = mantém o anterior)
  novoFim       DateTime?
  novoValor     Decimal? @db.Decimal(15,2)
  novaPeriodicidade Periodicidade?
  novoReajusteTipo TipoReajuste?  novoReajusteIndice IndiceReajuste?  novoReajustePercentual Decimal?
  documentoId   String?                 // aditivo assinado no GED
  assinadoEm    DateTime?
  aplicadoEm    DateTime?               // quando o sistema regenerou parcelas futuras
  criadoPor String? createdAt DateTime @default(now())
  @@unique([contratoId, numero])
}
```

`termosVigentes(contrato, data)` em `src/lib/contratos.ts` aplica os aditivos com `efeitoEm <= data`
em ordem. **Reajuste anual** aplicado pelo sistema também é registrado como aditivo `tipo=REAJUSTE`
(com o índice usado), para o histórico ser um só.

### 4.4 Obrigações (das duas partes)

```prisma
model ContratoObrigacao {
  id            String   @id @default(cuid())
  contratoId    String
  parte         ParteObrigacao          // NOSSA | CONTRAPARTE
  titulo        String                  // "Entregar CND federal", "Renovar apólice", "Relatório mensal de medição"
  tipo          TipoObrigacao           // DOCUMENTO | ENTREGA | SLA | PAGAMENTO | OUTRO
  categoriaGedId String?                // quando é DOCUMENTO: categoria que comprova (mesma mecânica do SstObrigacao)
  periodicidadeMeses Int?               // recorrente
  prazo         DateTime?               // única
  avisoDias     Int @default(30)
  responsavelId String?
  concluidaEm   DateTime?
  documentoId   String?                 // evidência
  observacoes   String?
}
```

Para terceirizados (NR-01 1.5.3/1.5.7), um **preset** "Contratada com empregados no nosso
estabelecimento" cria as obrigações padrão: PGR/PCMSO da contratada, ASO dos empregados,
ordem de serviço, comprovante de treinamento de integração. A evidência pode ser reaproveitada
do módulo SST quando o terceirizado estiver cadastrado como colaborador `tipoColaborador=TERCEIRO`.

### 4.5 Medições (contratos por medição / consumo)

```prisma
model ContratoMedicao {
  id            String   @id @default(cuid())
  contratoId    String
  numero        Int
  periodoInicio DateTime  periodoFim DateTime
  valor         Decimal @db.Decimal(15,2)
  status        StatusMedicao @default(RASCUNHO)   // RASCUNHO | EM_APROVACAO | APROVADA | REJEITADA | FATURADA
  itens         ContratoMedicaoItem[]              // item do contrato × quantidade × preço
  documentoId   String?                            // boletim de medição / relatório assinado
  contaPagarId  String?  contaReceberId String?    // título gerado ao aprovar
  aprovadoPor   String?  aprovadoEm DateTime?
  observacoes   String?
}
```

Aprovar medição = gerar título (CP ou CR conforme `lado`) com `contratoId`, natureza/centro do
contrato, vencimento = `periodoFim + prazoPagamentoDias`. Rejeitar devolve para rascunho com
motivo. Reusa `Aprovacao` do sistema (fluxo `MEDICAO_CONTRATO`).

### 4.6 Eventos / linha do tempo

```prisma
model ContratoEvento {
  id          String   @id @default(cuid())
  contratoId  String
  tipo        TipoEventoContrato  // CRIADO | APROVADO | ASSINADO | ADITIVO | REAJUSTE_PROJETADO | REAJUSTE_APLICADO | JANELA_AVISO_PREVIO | RENOVADO | ENCERRADO | RESCINDIDO | SUSPENSO | OBRIGACAO_VENCIDA | ALERTA_ENVIADO
  data        DateTime
  descricao   String
  dados       Json?
  usuarioId   String?
}
```

Projetados (futuro) vs registrados (passado) convivem na mesma tabela com `data`; o motor
recalcula os projetados a cada mudança de termos.

### 4.7 Ligações com modelos existentes (colunas novas, sem FK forte quando cruza módulo)

- `Documento.contratoId String?` + categorias GED `contratos` (já existe `cat_contratos`),
  `contratos-aditivos`, `contratos-garantias`, `contratos-obrigacoes`.
- `ContaPagar.contratoId String?`, `ContaReceber.contratoId String?` (+ `medicaoId`).
- `PedidoCompra.contratoId String?` (pedido amparado por contrato → preço vem do item do contrato).
- `DocumentoEntrada.contratoId String?` (entrada amparada por contrato → confere preço).
- `AprovacaoEtapa.contratoId String?` e `medicaoId String?` (mesmo padrão de `pedidoCompraId`).

### 4.8 Enums

`TipoContrato`: FORNECIMENTO, SERVICO, LOCACAO, SOFTWARE_ASSINATURA, SEGURO, PLANO_SAUDE,
TRANSPORTE, OBRA, VENDA_RECORRENTE, VENDA_A_ORDEM, TERCEIRIZACAO, OUTRO.
`LadoContrato`: DESPESA, RECEITA. `StatusContrato`: MINUTA, EM_APROVACAO, VIGENTE, EM_RENOVACAO,
SUSPENSO, ENCERRADO, RESCINDIDO. `TipoRenovacao`: NENHUMA, AUTOMATICA, MANUAL.
`ModalidadeValor`: FIXO_MENSAL, FIXO_UNICO, POR_MEDICAO, POR_CONSUMO, ESTIMADO.
`Periodicidade`: MENSAL, BIMESTRAL, TRIMESTRAL, SEMESTRAL, ANUAL. `TipoReajuste`: NENHUM, INDICE,
PERCENTUAL, NEGOCIADO. `IndiceReajuste`: IPCA, IGPM, INPC, SELIC, OUTRO. `TipoAditivo`,
`ParteObrigacao`, `TipoObrigacao`, `StatusMedicao`, `TipoEventoContrato` como acima.

## 5. Motor (`src/lib/contratos.ts`) — o coração do módulo

Funções puras + uma rotina diária (cron `contratos-vencimentos`, padrão `sst-vencimentos`).

1. **`termosVigentes(contrato, data)`** — contrato + aditivos → `{ valor, periodicidade, fim,
   reajuste… }` válidos na data.
2. **`projetarEventos(contrato)`** — recalcula eventos futuros:
   - `JANELA_AVISO_PREVIO` em `fim − avisoPrevioDias` (renovação automática) → **esta é a data
     da decisão**; o alerta sai 30/15/7 dias antes dela, não do fim.
   - `REAJUSTE_PROJETADO` no aniversário (`reajusteMesBase`) com índice acumulado.
   - Fim de vigência (renovação manual/nenhuma): alertas a 90/60/30 dias.
   - Obrigações: `prazo − avisoDias`; recorrentes pela última evidência + periodicidade (mesma
     lógica de `pendenciasObrigacoes` do SST).
3. **`gerarParcelas(contrato, ate)`** — para FIXO_MENSAL/periódico, cria títulos **PREVISTOS** no
   CP/CR até o horizonte (12 meses ou fim), com `contratoId`, natureza/centro/forma do contrato,
   descrição "Contrato CT-0001 — parcela mm/aaaa". Idempotente (não duplica mês já gerado);
   **não toca** parcela já paga/baixada. Reajuste/aditivo regenera só as futuras em aberto.
   Decisão: títulos previstos nascem `ABERTA` (padrão do sistema — "caixa manual, títulos
   automáticos"), marcados `origem=CONTRATO` para o financeiro distinguir.
4. **`aplicarReajuste(contrato, indicePct)`** — cria aditivo `REAJUSTE`, regenera futuras,
   registra evento. Índices: tabela `IndiceEconomico(mes, indice, valor)` alimentada
   manualmente na v1 (IPCA/IGP-M/INPC do mês) — integração com API do BCB fica para depois.
5. **`pendenciasContrato(contrato, hoje)`** → lista tipada (como `PendenciaSst`): SEM_DOCUMENTO,
   NAO_ASSINADO, VENCE_EM_BREVE, JANELA_RESCISAO, REAJUSTE_PENDENTE, OBRIGACAO_VENCIDA,
   OBRIGACAO_VENCE_EM_BREVE, MEDICAO_SEM_APROVAR, PARCELA_FORA_DO_CONTRATO, SALDO_QUANTIDADE_ESGOTADO.
6. **`conformidadeContratos(empresaId)`** — agregados do painel + snapshot diário.
7. **Cruzamentos financeiros**: `titulosForaDeContrato(fornecedorId)` (CP do fornecedor com
   contrato vigente mas sem `contratoId`) e `divergenciaPreco(entrada)` (preço da entrada ≠
   preço do item do contrato ± tolerância).

Notificações: `notificarUsuario` (sino) + Telegram DM ao `responsavelId` e a quem tem permissão
`contratos.alertas`; digest diário, não um aviso por evento.

## 6. Processos

### 6.1 Cadastro → aprovação → vigência
1. Criar em **CreateDrawer** (padrão das telas de processo): dados básicos, contraparte (combobox
   com criação rápida), vigência/renovação, valor/reajuste, upload do PDF (vira `Documento` na
   categoria `contratos`, vinculado).
2. "Enviar para aprovação" → fluxo `CONTRATO` do `AprovacaoFluxo` (por valor total estimado e
   tipo; canais sino + Telegram, como pedido de compra). Aprovado → `VIGENTE` (se `inicio <= hoje`)
   e `gerarParcelas` roda. Reprovado → volta a `MINUTA` com motivo.
3. Editar contrato vigente em campo que muda termos (valor, prazo, reajuste) **exige aditivo**;
   campos administrativos (responsável, centro, tags, observações) editam direto.

### 6.2 Renovação / rescisão
- Na janela de aviso prévio a tela mostra a decisão: **Renovar** (gera aditivo de prazo e evento
  `RENOVADO`; se automática, basta "ciente") ou **Rescindir** (data, motivo, multa prevista;
  cancela parcelas futuras em aberto; status `RESCINDIDO`; pede documento de distrato).
- Renovação automática sem decisão até `fim`: o sistema **renova sozinho** (`fim += renovacaoMeses`,
  evento `RENOVADO` automático) e avisa — porque é o que aconteceu juridicamente.

### 6.3 Medição
Rascunho → enviar para aprovação → aprovada gera título → título pago fecha o ciclo. Boletim/
relatório anexado como evidência. Contratos POR_CONSUMO podem puxar a quantidade do Documento de
Entrada do período (fornecimento de material) em vez de digitar.

### 6.4 Obrigações
Mesma UX das obrigações do SST: lista com situação (Vigente / Vence em N dias / Vencida / Sem
evidência), "anexar no GED" na própria linha, concluir com data.

### 6.5 Encerramento
Ao atingir `fim` sem renovação: `ENCERRADO` automático + checklist de saída (devolução de
garantia, última medição, obrigações pendentes). Contrato encerrado é somente leitura.

## 7. Telas (rotas em `/contratos/*`; CreateDrawer, DataTable com paginação/colunas persistidas,
filtros persistidos por usuário, 3 pontinhos nas ações, ESC fecha, DatePicker padrão)

1. **Painel** `/contratos` — cards: vigentes, comprometido/mês (DESPESA) e receita contratada/mês
   (RECEITA), vencem em 90 dias, decisões pendentes (renovar/rescindir), reajustes do mês,
   obrigações vencidas, medições a aprovar. Lista de pendências por severidade. Modo grupo com
   `EmpresaTag`.
2. **Contratos** `/contratos/lista` — tabela: nº, título, contraparte, tipo, lado, vigência,
   valor/mês, próximo evento (data + tipo), situação, responsável. Filtros: lado, tipo, status,
   contraparte, responsável, vence até, texto. Abas Ativos / Encerrados.
3. **Contrato** `/contratos/[id]` — cabeçalho (status, semáforo, próximo evento, ações: aprovar,
   aditivo, renovar, rescindir, suspender) e abas: **Resumo** (termos vigentes + linha do tempo),
   **Documentos** (contrato, aditivos, garantias — GED), **Financeiro** (parcelas previstas ×
   realizadas, comprometido × pago, títulos fora de contrato), **Itens**, **Medições**,
   **Obrigações**, **Aditivos**, **Aprovações/Histórico**.
4. **Agenda** `/contratos/agenda` — calendário/lista dos eventos projetados dos próximos 12 meses
   (vencimentos, janelas, reajustes, obrigações) — exportável para o feed ICS já existente no
   Projetos (mesmo token HMAC).
5. **Medições** `/contratos/medicoes` — fila de aprovação.
6. **Configurações** `/contratos/configuracoes` — tipos de contrato (presets de obrigações),
   índices econômicos (IPCA/IGP-M por mês), fluxo de aprovação, dias padrão de aviso.

Pontos de entrada em outras telas: ficha do **Fornecedor** e do **Cliente** ganham aba
"Contratos"; **CP/CR** mostram chip "CT-0001" no título e filtro por contrato; **Documento de
Entrada** e **Pedido de Compra** ganham campo "Contrato" (opcional) com aviso de preço divergente.

## 8. Integrações com o que já existe

| Existente | Como o módulo usa |
|---|---|
| GED (`Documento`, versões, validade, confidencial) | Todo papel do contrato é `Documento`; `contratoId` liga; categorias próprias; upload pelo padrão `salvarArquivoDocumento` (Blob privado). |
| CP/CR + parcelamentos | Parcelas previstas = títulos `ABERTA` com `contratoId`/`grupoParcelamentoId`; reajuste regenera futuras; baixa segue o fluxo normal (encargos, rateio por natureza). |
| Naturezas / centros de custo / TES | Contrato carrega natureza + centro padrão → títulos nascem classificados (regra "CP nasce classificado"). |
| Aprovações (`AprovacaoFluxo`/`AprovacaoEtapa`) | Fluxos `CONTRATO` e `MEDICAO_CONTRATO`; dois canais (sino + Telegram); webhook de resposta reaproveitado. |
| Fornecedor ↔ Cliente por CNPJ | Contraparte única mesmo quando a pessoa é cliente e fornecedor. |
| Notificações + Telegram + cron | Digest diário `contratos-vencimentos` (vercel.json, `CRON_SECRET`). |
| Projetos | Botão "criar tarefa" para ações decorrentes (negociar renovação, cobrar documento) com vínculo `tarefaId` sem FK, como no SST. |
| SST | Obrigações de terceirizados reutilizam categorias GED do SST e, se o terceirizado é `Colaborador` TERCEIRO, a conformidade dele. |
| Lixeira | Exclusão de contrato/medição faz snapshot (`TipoLixeira` novo `CONTRATO`). |
| Permissões | Módulo `contratos` em `modules.ts` com recursos: painel, lista, medicoes, agenda, configuracoes, alertas; leitura cruzada por `requireModuloAny(["contratos","financeiro"])` nos lookups do CP/CR. |

## 9. Relatórios

- Comprometido por mês (12 meses) por empresa / fornecedor / natureza — base do fluxo de caixa.
- Vencimentos e decisões dos próximos 90/180 dias.
- Reajustes do ano (aplicados × projetados × índice usado).
- Contrato × realizado (previsto, medido, pago, saldo de quantidade).
- Títulos fora de contrato por fornecedor.
- Terceirizados: conformidade documental por contrato (para fiscalização do trabalho).
- Todos em tela com `useRelatorioCache` e exportação PDF (`gerarPdfContabil`) / planilha.

## 10. Fases

| Fase | Entrega | Esforço |
|---|---|---|
| **1 — Base** | `Contrato`, `ContratoAditivo`, `ContratoEvento`, `Documento.contratoId`; CreateDrawer; lista; página do contrato (Resumo/Documentos/Aditivos); motor de eventos + cron + alertas; renovar/rescindir; abas em Fornecedor/Cliente; permissões; lixeira. Importar os contratos atuais do GED (`cat_contratos`). | ~1 semana |
| **2 — Financeiro** | `ContaPagar/ContaReceber.contratoId`; `gerarParcelas`; reajuste (índices manuais) regenerando futuras; aba Financeiro; chip/filtro por contrato no CP/CR; títulos fora de contrato; relatório de comprometido. | ~1 semana |
| **3 — Operação** | `ContratoItem`, `ContratoObrigacao` (+ presets, terceirizados), `ContratoMedicao` com aprovação; vínculo com Pedido de Compra/Documento de Entrada e aviso de preço; agenda + ICS; painel completo. | ~1,5 semana |
| **4 — Assinatura e índices** | Provider de assinatura eletrônica (Clicksign/D4Sign/ZapSign) via `AssinaturaProvider` — enviar para assinar, webhook de concluído, PDF assinado vira versão no GED; índices via API do BCB (SGS). | sob demanda |

## 11. Riscos e decisões abertas (para o dono)

1. **Parcelas previstas no CP/CR como títulos `ABERTA`** ou como uma tabela própria de previsão
   (só vira título no mês)? Recomendo títulos `ABERTA` com `origem=CONTRATO`: aparecem no fluxo
   de caixa de verdade, e o financeiro já lida com título aberto. Contra: inflam o "a pagar" com
   12 meses à frente — mitigado por filtro/aba "previstos" no CP. **Decidir.**
2. **Preço divergente na entrada**: aviso ou bloqueio? Proposta: aviso na v1 (hard block quebra
   recebimento de material com reajuste ainda não lançado).
3. **Renovação automática sem decisão**: o sistema renova sozinho (reflete o contrato) ou só
   marca "renovado?" para alguém confirmar? Proposta: renova sozinho + alerta, porque é o fato
   jurídico; confirmar é trabalho a mais que não muda a realidade.
4. **Quem é o "responsável"**: usuário (recebe alerta) ou colaborador? Proposta: usuário, igual
   ao `responsavelId` do GED.
5. **Contratos com clientes à ordem/varejo** (Cimento e Mix): entram na v1 ou só fornecimento?
   Proposta: modelo suporta `RECEITA` desde a fase 1, mas o piloto é com fornecedores.
6. **Multiempresa**: contrato guarda-chuva do grupo com rateio entre empresas (ex.: software,
   seguro frota)? Proposta v1: um contrato por empresa pagadora; "contrato-mãe" fica para depois.
7. Índices econômicos manuais na v1 (alguém digita IPCA/IGP-M do mês) — aceitável?

## 12. Fora de escopo (explicitamente)

Editor de minutas/cláusulas e templates jurídicos; workflow de negociação de redação (comentários
em cláusula); assinatura eletrônica embutida (fase 4 como integração); gestão de processos
judiciais; contratos de trabalho CLT e folha (RH); cálculo automático de multa rescisória além do
texto informativo.

## 13. Métricas de sucesso

- 100% dos contratos vigentes com PDF assinado no GED e responsável definido.
- Zero renovação automática "descoberta depois": toda janela de aviso prévio com decisão
  registrada antes de `fim`.
- Reajustes aplicados no mês de aniversário (± 30 dias) em ≥ 90% dos contratos com índice.
- Títulos de fornecedores com contrato vigente sem `contratoId` < 5% do valor pago no mês.
- Comprometido dos próximos 12 meses disponível no fluxo de caixa sem planilha paralela.
