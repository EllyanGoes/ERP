# PRD — Módulo de Manutenção (PCM nativo, substituição do Engeman)

> Status: APROVADO (24/out/2026). Fases 1–4 em produção em 24/out: histórico do Engeman importado,
> Engeman REMOVIDO do código (sem `mssql`, sem tela de integração). Pendentes: medidores pelo PCP
> (§11) e a confirmação manual do de-para de materiais (Configurações › Materiais → produtos).
> Próximo ciclo (decidido em 24/out): mapa da planta + indicadores (Confiabilidade), fusão de telas,
> limpeza de tipos/equipes/catálogo — ver §14.
> Decisão de partida: **o Engeman deixa de ser usado.** A manutenção passa a ser registrada e
> planejada dentro do ERP; o Engeman vira só fonte de uma **importação única** do histórico.
> Princípio central: **a OS é o fato da manutenção** — tudo (parada, mão de obra, peça, terceiro,
> custo, indicador) pendura nela, e os indicadores saem dela, não de planilha.

## 1. Contexto e objetivo

Hoje o PCM do ERP é uma **camada de leitura** sobre a réplica SQL Server do Engeman
(`src/lib/engeman.ts`, `mssql`, tabelas `APLIC`, `LOCAPLIC`, `ORDSERV`, `REGSERV`, `ORDXPAR`,
`ORDXFUN`, `FUNC`, `TIPMANUT`, `PLAMANUT`, `DEFEITO`, `CAUSA`, `SETEXE`):

| Tela atual (`/pcm/*`) | De onde vem | O que só existe no ERP |
|---|---|---|
| Ativos (árvore) | `APLIC` / `LOCAPLIC` | `AtivoCriticidade` (A/B/C), `AtivoRegime` (h/dia) por `codApl` |
| Relatório de O.S. / detalhe | `ORDSERV` + `REGSERV` + `ORDXPAR` | — |
| Quadro de O.S. | `ORDSERV` abertas por `SETEXE` + `ORDXFUN` | — |
| Planos de Manut. (aderência) | `PLAMANUT` + `ORDSERV.CODPLA` | — |
| MTBF/MTTR, Fechamento mensal | `ORDSERV`/`REGSERV.CODDEF`/`ORDXPAR` | `FechamentoMtbf` (validação do mês) |
| FMEA por ativo | `REGSERV` (defeito/causa) | — |
| Qualidade do cadastro | `APLIC`/`ORDSERV` (OS sem ativo, ativo sem local…) | — |

E três módulos apontam para o Engeman por **`codApl` sem FK**: `SstMaquina.codApl` (inventário
NR-12, importado do Engeman), `CentroTrabalho.codApl` (forno/secador do PCP) e o campo texto
`RequisicaoMaterial.os` / `RequisicaoMaterialItem.os` (nº da OS digitado à mão).

Problemas do modelo atual, além da própria saída do Engeman:

- **Duas fontes da verdade**: o ativo vive no Engeman, a criticidade/regime/NR-12 vivem no ERP,
  ligados por um inteiro solto. Ativo novo no Engeman não aparece no SST; ativo baixado continua lá.
- **Custo de manutenção invisível**: a peça sai do almoxarifado pela requisição do ERP com um nº de
  OS em texto livre; a mão de obra e o terceiro nunca encontram a OS. Não dá para responder
  "quanto custou manter o forno 2 este ano".
- **Dependência de rede**: réplica fora do ar = PCM inteiro em 503 ("Engeman indisponível").
- **Dados de parada frágeis**: MTTR depende do carimbo `MAQPAR→MAQFUN`; OS sem carimbo entram como
  0h (há aviso na tela de detalhe pedindo para "preencher no Engeman").

**Objetivo:** um módulo de manutenção completo e nativo, com cinco propriedades:

1. **Ativo é cadastro-mestre do ERP**, hierárquico, por empresa, ligado a imobilizado, centro de
   custo, centro de trabalho (PCP) e máquina NR-12 (SST) por FK de verdade.
2. **Todo pedido de manutenção vira registro**: Solicitação de Serviço (qualquer pessoa abre) →
   Ordem de Serviço (manutenção planeja, executa e encerra).
3. **Preventiva roda sozinha**: planos por calendário ou por medidor geram as OS com antecedência.
4. **Custo real por OS e por ativo**: mão de obra apontada + peças (requisição vinculada) +
   serviços de terceiros (pedido de compra / CP vinculados).
5. **Indicadores nativos** (MTBF, MTTR, disponibilidade, backlog, aderência à preventiva, custo)
   calculados das OS, sem conexão externa.

**Fora do objetivo:** CMMS de frota rodoviária (abastecimento, multas, pneus por posição — ver
§12); telemetria/IoT em tempo real; gestão de obras civis (fica no Projetos).

## 2. Personas e usos

| Persona | O que faz no módulo |
|---|---|
| **Operador / líder de produção** (qualquer usuário) | Abre **Solicitação de Serviço** (pelo celular, com foto), informando ativo, sintoma e se a máquina parou. Acompanha o status. |
| **PCM / planejador de manutenção** (operador principal) | Faz a triagem das SS, converte em OS, define prioridade, prazo, equipe, materiais; mantém planos preventivos, ativos e catálogo de falhas; fecha o mês de MTBF. |
| **Técnico / mecânico / eletricista** | Vê sua fila (quadro), inicia/pausa/encerra a OS, aponta horas, pede peça (requisição), registra defeito/causa/serviço executado e o checklist do plano. |
| **Almoxarifado** | Atende a requisição vinculada à OS (como hoje); vê kits previstos das preventivas da semana. |
| **Compras** | Recebe SC de peça/serviço gerada a partir da OS; o pedido carrega a OS. |
| **Segurança (SST)** | Máquina NR-12 = ativo do módulo; não conformidade de inspeção abre SS. |
| **Gerente / dono** | Painel: disponibilidade dos ativos críticos, backlog em horas, % corretiva × preventiva, custo por ativo/centro de custo, OS atrasadas. |

## 3. Conceitos

| Conceito | Definição |
|---|---|
| **Ativo** | Qualquer item mantido: local/área (nó agrupador), equipamento, subconjunto, componente. Árvore livre (`paiId`), ex.: `Fábrica › Queima › Forno 2 › Queimador 3`. Substitui `APLIC`+`LOCAPLIC`. |
| **Criticidade** | A/B/C no próprio ativo (hoje em `AtivoCriticidade`). Define prioridade padrão das OS, exigência de plano preventivo e estoque mínimo de sobressalente. |
| **Solicitação de Serviço (SS)** | Pedido de qualquer usuário. Não tem custo nem apontamento. Triagem: vira OS, é recusada (com motivo) ou é anexada a uma OS existente (duplicada). |
| **Ordem de Serviço (OS)** | Unidade de trabalho da manutenção. Tem tipo, prioridade, ativo, datas planejadas/reais, **parada** do ativo, apontamentos, materiais, terceiros, checklist e registro de falha. |
| **Tipo de manutenção** | Corretiva (emergencial/programada), Preventiva, Preditiva, Inspeção/Rota, Lubrificação, Melhoria, Outros. Flag `corretiva` substitui a config `pcm_tipos_corretivos`. |
| **Plano de manutenção** | Gatilho (calendário ou medidor) + tarefas (checklist) + materiais previstos (kit) + equipe/tempo estimado, aplicado a um ou mais ativos. Substitui `PLAMANUT`. |
| **Medidor** | Contador de uso do ativo (horímetro, km, ciclos, **milheiros produzidos**). Leituras manuais ou automáticas (PCP). Dispara planos por uso. |
| **Parada** | Intervalo em que o ativo ficou **indisponível** por causa da OS (`paradaInicio`→`paradaFim`). Substitui `ORDXPAR.MAQPAR/MAQFUN`. Base do MTTR e da disponibilidade. |
| **Falha** | OS corretiva com **sintoma/defeito** preenchido. Só falha conta no MTBF (mesma regra de hoje: `REGSERV.CODDEF IS NOT NULL`). |
| **Catálogo de falhas** | Sintoma (o que se viu), Causa (por quê), Ação (o que se fez), por família de ativo. Substitui `DEFEITO`/`CAUSA`. Alimenta FMEA e Pareto. |

## 4. Modelo de dados (Prisma; migrations idempotentes, sem `db push` em produção)

Convenções do projeto: `empresaId` escopado, autoria carimbada pelo proxy
(`criadoPor`/`atualizadoPor`), exclusão destrutiva vira lixeira (`salvarNaLixeira`) — e, no caso
de ativo/OS com histórico, **inativação/cancelamento em vez de exclusão**. Anexos (fotos, laudos,
manuais) no GED (`Documento`). Numeração **sem ano** (`OS-0001`, `SS-0001`), por empresa.
Prefixo `Manut` nos modelos (evita ambiguidade com "ativo" contábil).

### 4.1 Ativos

```prisma
model ManutAtivo {
  id               String   @id @default(cuid())
  empresaId        String
  paiId            String?              // árvore livre (local › equipamento › componente)
  tag              String               // código visível (ex.: FOR-02), único por empresa
  nome             String
  tipo             ManutTipoAtivo       // LOCAL | EQUIPAMENTO | COMPONENTE
  familiaId        String?              // família (forno, extrusora, carregadeira…) — filtra catálogo de falhas e planos
  criticidade      Criticidade?         // A/B/C (migra de AtivoCriticidade)
  horasPorDia      Float?               // regime (migra de AtivoRegime); null = herda do pai, senão 24
  status           ManutStatusAtivo     @default(OPERANDO) // OPERANDO | PARADO | EM_MANUTENCAO | INATIVO
  setorId          String?
  centroCustoId    String?              // destino gerencial do custo da OS
  imobilizadoId    String?              // bem patrimonial (capex de melhoria, baixa de componente)
  fabricante       String?
  modelo           String?
  numeroSerie      String?
  anoFabricacao    Int?
  dataInstalacao   DateTime?
  fornecedorId     String?              // assistência técnica / fabricante
  garantiaAte      DateTime?
  codAplLegado     Int?                 // CODAPL do Engeman (rastreio da importação; índice, sem unique global)
  observacoes      String?
  ativo            Boolean  @default(true)
  criadoPor        String?
  atualizadoPor    String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@unique([empresaId, tag])
  @@index([empresaId, paiId])
  @@index([codAplLegado])
}

model ManutFamilia { id String @id @default(cuid()); empresaId String; nome String; ativo Boolean @default(true) }

// Ficha técnica livre (potência, tensão, capacidade…) e sobressalentes do ativo.
model ManutAtivoAtributo { id String @id @default(cuid()); ativoId String; nome String; valor String }
model ManutAtivoPeca {                   // lista de sobressalentes (BOM de manutenção)
  id String @id @default(cuid())
  ativoId String
  itemId String                          // Item do estoque
  quantidade Decimal @db.Decimal(15, 3)
  estoqueMinimo Decimal? @db.Decimal(15, 3) // sugere ponto de pedido p/ ativo crítico
}
```

Ligações (colunas novas, FK real): `SstMaquina.ativoId`, `CentroTrabalho.ativoId`.
`codApl` dessas tabelas fica até o fim da migração e depois sai (§10, fase 4).
`AtivoCriticidade`/`AtivoRegime` são absorvidos pelo `ManutAtivo` e removidos.

### 4.2 Medidores

```prisma
model ManutMedidor {
  id            String  @id @default(cuid())
  ativoId       String
  nome          String               // "Horímetro", "Odômetro", "Milheiros queimados"
  unidade       String               // h, km, ciclos, milheiro
  origem        ManutOrigemMedidor   @default(MANUAL) // MANUAL | PCP_PRODUCAO | PCP_HORAS_FORNO
  acumulado     Decimal @db.Decimal(15, 2) @default(0)
  ativo         Boolean @default(true)
}

model ManutLeitura {
  id         String   @id @default(cuid())
  medidorId  String
  data       DateTime
  valor      Decimal  @db.Decimal(15, 2)    // leitura absoluta (o motor calcula o delta)
  origem     String?                         // "manual", "OP-0123"…
  criadoPor  String?
  @@index([medidorId, data])
}
```

### 4.3 Catálogo e tipos

```prisma
model ManutTipo {               // substitui TIPMANUT + config pcm_tipos_corretivos
  id String @id @default(cuid())
  empresaId String
  sigla String                  // CRN, PRV, PRD, INS, LUB, MEL…
  nome String
  natureza ManutNaturezaTipo    // CORRETIVA | PREVENTIVA | PREDITIVA | INSPECAO | MELHORIA | OUTROS
  contaComoFalha Boolean        // true só p/ corretivas
  ativo Boolean @default(true)
  @@unique([empresaId, sigla])
}

model ManutCatalogo {           // substitui DEFEITO / CAUSA (+ ação)
  id String @id @default(cuid())
  empresaId String
  tipo ManutTipoCatalogo        // SINTOMA | CAUSA | ACAO
  familiaId String?             // null = vale p/ todas as famílias
  codigo String?
  descricao String
  ativo Boolean @default(true)
}

model ManutEquipe {             // substitui SETEXE (mecânica, elétrica, lubrificação, terceiros…)
  id String @id @default(cuid())
  empresaId String
  nome String
  membros ManutEquipeMembro[]   // colaboradorId + custoHora? (override)
}
```

### 4.4 Solicitação de Serviço

```prisma
model ManutSolicitacao {
  id             String   @id @default(cuid())
  empresaId      String
  numero         String               // SS-0001
  ativoId        String?              // obrigatório na triagem, opcional na abertura (leigo pode não saber)
  localTexto     String?              // "perto do forno 2" quando não achou o ativo
  descricao      String
  ativoParado    Boolean  @default(false)
  paradoDesde    DateTime?            // vira paradaInicio da OS
  prioridadeSugerida ManutPrioridade?
  status         ManutStatusSS        @default(ABERTA) // ABERTA | EM_TRIAGEM | CONVERTIDA | RECUSADA | DUPLICADA
  ordemId        String?              // OS gerada / OS a que foi anexada
  motivoRecusa   String?
  solicitanteId  String               // Usuario
  origem         ManutOrigemSS        @default(USUARIO) // USUARIO | SST_INSPECAO | SST_INCIDENTE | PCP
  origemId       String?
  criadoPor String?; atualizadoPor String?
  createdAt DateTime @default(now()); updatedAt DateTime @updatedAt
  @@unique([empresaId, numero])
}
```

### 4.5 Ordem de Serviço

```prisma
model ManutOrdem {
  id                 String   @id @default(cuid())
  empresaId          String
  numero             String                // OS-0001
  ativoId            String
  tipoId             String
  planoId            String?               // gerada por plano
  planoExecucaoRef   String?               // vencimento que originou (data ou leitura), idempotência
  equipeId           String?
  responsavelId      String?               // Colaborador líder
  prioridade         ManutPrioridade       // EMERGENCIA | ALTA | MEDIA | BAIXA (padrão vem da criticidade)
  status             ManutStatusOS         @default(ABERTA)
  descricao          String                // solicitação
  // planejamento
  programadaPara     DateTime?
  prazo              DateTime?
  horasEstimadas     Decimal? @db.Decimal(10, 2)
  exigeParada        Boolean  @default(false)
  // execução
  iniciadaEm         DateTime?
  concluidaEm        DateTime?
  paradaInicio       DateTime?             // ativo indisponível (MTTR / disponibilidade)
  paradaFim          DateTime?
  // registro técnico (falha)
  sintomaId          String?
  causaId            String?
  acaoId             String?
  servicoExecutado   String?
  // custo consolidado (recalculado pelo motor; persistido p/ relatório rápido)
  custoMaoObra       Decimal  @db.Decimal(15, 2) @default(0)
  custoMaterial      Decimal  @db.Decimal(15, 2) @default(0)
  custoTerceiros     Decimal  @db.Decimal(15, 2) @default(0)
  centroCustoId      String?               // herda do ativo; editável
  // melhoria capitalizável (capex) — reaproveita a lógica de linha (capitaliza/imobilizadoId)
  capitaliza         Boolean  @default(false)
  // legado
  codOrdLegado       Int?                  // CODORD do Engeman
  numeroLegado       String?               // ORDSERV.TAG
  motivoCancelamento String?
  criadoPor String?; atualizadoPor String?
  createdAt DateTime @default(now()); updatedAt DateTime @updatedAt
  @@unique([empresaId, numero])
  @@unique([planoId, planoExecucaoRef])     // plano nunca gera a mesma OS duas vezes
  @@index([empresaId, status])
  @@index([ativoId, concluidaEm])
}

model ManutApontamento {          // mão de obra (substitui ORDXFUN)
  id String @id @default(cuid())
  ordemId String
  colaboradorId String
  inicio DateTime
  fim DateTime?                    // null = em andamento (cronômetro do celular)
  horas Decimal? @db.Decimal(10, 2)
  custoHora Decimal? @db.Decimal(10, 2) // congelado no apontamento
  observacao String?
}

model ManutOrdemTarefa {          // checklist (copiado do plano ao gerar)
  id String @id @default(cuid())
  ordemId String
  ordem Int
  descricao String
  tipoResposta ManutTipoResposta  // OK_NOK | NUMERO | TEXTO
  faixaMin Decimal?; faixaMax Decimal? // NUMERO fora da faixa → sugere SS corretiva
  resposta String?
  conforme Boolean?
  executadoPor String?
}

model ManutOrdemMaterialPrevisto { id String @id @default(cuid()); ordemId String; itemId String; quantidade Decimal @db.Decimal(15, 3) }

model ManutOrdemTerceiro {        // serviço externo
  id String @id @default(cuid())
  ordemId String
  fornecedorId String?
  descricao String
  pedidoCompraId String?          // PC vinculado (preferencial)
  contaPagarId String?            // ou CP avulso
  contratoId String?              // contrato de manutenção (módulo Contratos)
  valor Decimal @db.Decimal(15, 2)
}

model ManutOrdemEvento {          // linha do tempo (status, pausas e motivo)
  id String @id @default(cuid())
  ordemId String
  tipo String                      // CRIADA, LIBERADA, INICIADA, PAUSADA, AGUARDANDO_MATERIAL…
  detalhe String?
  usuario String?
  createdAt DateTime @default(now())
}
```

**Materiais reais** vêm da requisição: `RequisicaoMaterial.ordemServicoId` e
`RequisicaoMaterialItem.ordemServicoId` (FK nova, substitui o texto `os`; o texto fica como
legado). O custo é o da saída já calculada pelo estoque (CMPM por empresa) — o módulo **não**
recalcula custo de peça. Mesma coisa para `PedidoCompra`/`SolicitacaoCompra`: coluna
`ordemServicoId`.

### 4.6 Planos

```prisma
model ManutPlano {
  id              String  @id @default(cuid())
  empresaId       String
  codigo          String
  nome            String
  tipoId          String               // preventiva, lubrificação, inspeção, preditiva
  gatilho         ManutGatilho         // CALENDARIO | MEDIDOR | O_QUE_VIER_PRIMEIRO
  intervaloDias   Int?
  intervaloMedida Decimal? @db.Decimal(15, 2)  // a cada N h / km / milheiros
  antecedenciaDias Int    @default(7)          // gera a OS N dias antes
  toleranciaPct   Int     @default(10)         // janela p/ contar como "no prazo" na aderência
  baseNaConclusao Boolean @default(true)       // próximo vencimento conta da execução real (não da data teórica)
  equipeId        String?
  horasEstimadas  Decimal? @db.Decimal(10, 2)
  exigeParada     Boolean @default(false)
  ativo           Boolean @default(true)
  codPlaLegado    Int?
  tarefas         ManutPlanoTarefa[]           // checklist modelo
  materiais       ManutPlanoMaterial[]         // kit
  ativos          ManutPlanoAtivo[]            // aplicado a N ativos; cada vínculo guarda o último vencimento/medida
}

model ManutPlanoAtivo {
  id String @id @default(cuid())
  planoId String
  ativoId String
  medidorId String?               // obrigatório quando gatilho usa medidor
  ultimaExecucao DateTime?
  ultimaMedida Decimal? @db.Decimal(15, 2)
  proximoVencimento DateTime?     // calculado
  proximaMedida Decimal? @db.Decimal(15, 2)
  @@unique([planoId, ativoId])
}
```

### 4.7 Indicadores

`FechamentoMtbf` permanece (validação mensal é decisão de negócio, não do Engeman), trocando
`codApl` por `ativoId` (backfill pelo `codAplLegado`). O pré-preenchimento passa a vir das OS do ERP.

### 4.8 Enums

`ManutTipoAtivo`, `ManutStatusAtivo`, `ManutNaturezaTipo`, `ManutTipoCatalogo`, `ManutPrioridade`,
`ManutStatusSS`, `ManutOrigemSS`, `ManutStatusOS` (`ABERTA`, `PLANEJADA`, `LIBERADA`,
`EM_EXECUCAO`, `PAUSADA`, `AGUARDANDO_MATERIAL`, `AGUARDANDO_TERCEIRO`, `CONCLUIDA`, `CANCELADA`),
`ManutGatilho`, `ManutOrigemMedidor`, `ManutTipoResposta`. `Criticidade` (A/B/C) é reaproveitado.

## 5. Motor (`src/lib/manutencao/`) — regras que não podem ficar espalhadas nas rotas

1. **Máquina de estados da OS** (`transicionarOrdem`): única porta de mudança de status; grava
   `ManutOrdemEvento`, valida pré-condições e atualiza `ManutAtivo.status`:
   - `CONCLUIDA` exige: apontamento fechado (nenhum cronômetro aberto), checklist respondido (se
     houver), e — se o tipo `contaComoFalha` — sintoma e causa. Se `paradaInicio` existe, exige
     `paradaFim`. **Acaba o "parada entrou como 0h"**: a regra está na conclusão, não no relatório.
   - Reabrir OS concluída é permitido (com motivo) e recalcula custo/indicadores do mês, a menos que
     o mês do MTBF esteja **fechado** (aí só o PCM, com aviso).
2. **Custo da OS** (`recalcularCustoOrdem`): MO = Σ horas × custoHora congelado; material = Σ saídas
   das requisições vinculadas (líquido de devoluções); terceiros = Σ `ManutOrdemTerceiro.valor`
   (do PC/CP quando vinculado). Chamado em todo caminho que mexe nesses filhos (mesma disciplina do
   `recomputarStatusPedido`).
3. **Custo-hora da mão de obra**: precedência `ManutEquipeMembro.custoHora` > custo-hora calculado do
   colaborador (salário + encargos ÷ horas/mês, a partir do RH) > padrão da empresa. Congelado no
   apontamento. **Só gerencial**: a MO já é contabilizada pela folha; o módulo não lança contábil de MO.
4. **Gerador de preventivas** (cron diário + botão "gerar agora"): para cada `ManutPlanoAtivo`
   ativo, se `proximoVencimento − antecedência ≤ hoje` ou `acumulado do medidor ≥ proximaMedida −
   margem`, cria a OS (status `PLANEJADA`, checklist e kit copiados), idempotente por
   `@@unique([planoId, planoExecucaoRef])`. Não gera nova se a anterior do mesmo plano/ativo ainda
   está aberta (marca como "atrasada" em vez de empilhar).
5. **Próximo vencimento**: ao concluir OS de plano, `baseNaConclusao` decide se conta da execução
   real ou da data teórica; atualiza `ultimaExecucao/ultimaMedida/proximo*`.
6. **Indicadores** (`src/lib/manutencao/indicadores.ts`, substitui `pcm-mtbf.ts`):
   - **Falha** = OS concluída de tipo `contaComoFalha` com sintoma.
   - **MTBF** = tempo de funcionamento ÷ nº de falhas; funcionamento = dias × `horasPorDia` − paradas.
   - **MTTR** = Σ (paradaFim − paradaInicio) das falhas ÷ nº de falhas.
   - **Disponibilidade** = (funcionamento − parada não planejada) ÷ funcionamento.
   - **Aderência à preventiva** = OS de plano concluídas dentro da tolerância ÷ OS de plano vencidas.
   - **Backlog** = Σ horas estimadas das OS abertas ÷ capacidade semanal da equipe (semanas).
   - **% corretiva × planejada**, **custo por ativo / centro de custo / tipo**, **custo ÷ valor do
     ativo** (quando há imobilizado).
   Paradas são recortadas por mês (uma parada que cruza a virada conta em cada mês a sua parte).
7. **Status do ativo** derivado das OS abertas com parada: parado se existe OS com `paradaInicio` e
   sem `paradaFim`. Persistido (`ManutAtivo.status`) e recomputado pelo motor — nunca editado à mão,
   exceto `INATIVO`.

## 6. Processos

### 6.1 Corretiva (o fluxo do dia a dia)

1. Operador abre **SS** (celular): escolhe o ativo (busca por tag/nome ou **QR code** colado na
   máquina), descreve, marca "máquina parada" (+ desde quando), anexa foto.
2. PCM recebe notificação in-app (`notificarUsuario`); emergência notifica também a equipe.
3. **Triagem**: converte em OS (define tipo, prioridade, equipe, prazo), anexa a uma OS aberta do
   mesmo ativo (duplicada) ou recusa com motivo. Solicitante é notificado.
4. Técnico **inicia** a OS (cronômetro de apontamento), pede peça → cria **requisição vinculada**
   direto da OS (almox atende como hoje); falta peça → status `AGUARDANDO_MATERIAL` + **SC** gerada
   da OS; serviço externo → `AGUARDANDO_TERCEIRO` + vínculo do PC/contrato.
5. Técnico **encerra**: sintoma/causa/ação do catálogo, serviço executado, fim da parada.
6. PCM revisa e **conclui**; custo consolidado; ativo volta a `OPERANDO`.

Emergência pode pular a SS (OS direta) — a OS registra que nasceu sem solicitação.

### 6.2 Preventiva / inspeção / lubrificação

Plano → gerador cria OS `PLANEJADA` com antecedência → PCM programa na semana (quadro) → OS
`LIBERADA` (kit separado pelo almox, opcional) → execução com checklist → item NOK ou leitura fora
da faixa sugere **SS corretiva** já preenchida → conclusão recalcula o próximo vencimento.

### 6.3 Medidores

Leitura manual (lote na tela, ou no celular pelo QR). Medidores com origem PCP somam sozinhos:
`PCP_PRODUCAO` (milheiros apontados nas OPs do centro de trabalho do ativo) e `PCP_HORAS_FORNO`
(horas de queima). Leitura menor que a anterior é bloqueada (exceto "troca de medidor", que zera
com motivo).

### 6.4 Melhoria capitalizável

OS de tipo Melhoria com `capitaliza = true` exige `ManutAtivo.imobilizadoId`; as requisições
vinculadas herdam `capitaliza`/`imobilizadoId` na linha (precedência existente em
`rotear-requisicao.ts`), e troca de componente segue a baixa CPC 27 já implementada. O módulo não
cria regra contábil nova.

### 6.5 Fechamento mensal de MTBF

Igual ao atual (`/pcm/ativo-saude/fechamento`), mas pré-preenchido pelas OS do ERP. Mês fechado
trava edição de OS daquele mês para não-PCM.

## 7. Telas (rotas em `/pcm/*` — mantidas para não quebrar links e permissões; CreateDrawer,
DataTable com paginação/colunas persistidas, filtros persistidos, ComboboxWithCreate, DatePicker)

| Rota | Conteúdo |
|---|---|
| `/pcm` | **Painel**: ativos parados agora, OS emergência/atrasadas, backlog (semanas), aderência do mês, disponibilidade dos críticos A, custo do mês × média. |
| `/pcm/solicitacoes` | Fila de SS com triagem em lote (converter/anexar/recusar). Visão "minhas SS" para quem não é da manutenção. |
| `/pcm/ordens` | Lista de OS (substitui "Relatório de O.S."): filtros por status/tipo/ativo/equipe/período, export. |
| `/pcm/ordens/[id]` | OS em abas: Resumo · Checklist · Apontamentos · Materiais (requisições + previstos) · Terceiros · Falha · Linha do tempo · Anexos. |
| `/pcm/quadro-os` | **Kanban** por status e por equipe (como hoje), com programação semanal (arrastar OS para o dia). |
| `/pcm/ativos` | Árvore + detalhe do ativo em abas: Ficha · OS (histórico) · Planos · Medidores · Sobressalentes · Indicadores · Custos · NR-12 (link SST) · Documentos. Imprimir **etiqueta QR**. |
| `/pcm/planos` | Cadastro de planos + aderência (a tela atual de execução vira uma aba). Calendário de vencimentos (próximos 90 dias). |
| `/pcm/medidores` | Leituras em lote. |
| `/pcm/ativo-saude/*` | MTBF/MTTR, fechamento mensal (mantidos, fonte nativa). |
| `/pcm/fmea/[ativo]` | FMEA (mantido, fonte nativa — sintoma × causa × ação, frequência e severidade). |
| `/pcm/relatorios` | Custo por ativo/centro/tipo, Pareto de falhas, % corretiva, backlog, produtividade da equipe (horas apontadas ÷ disponíveis). |
| `/pcm/configuracoes` | Tipos, catálogo de falhas, famílias, equipes e custo-hora, prioridade padrão por criticidade. Substitui "Tipos de OS". |
| `/pcm/qualidade` | Mantida, com regras nativas (ativo crítico sem plano, OS concluída sem falha registrada, OS sem parada, apontamento aberto há > 24h). |

Celular (padrão de `docs/mobile-web-prd.md`): abrir SS, "minhas OS", iniciar/pausar/encerrar,
checklist, foto, leitura de medidor — tudo a partir do QR do ativo.

Tela e itens novos entram em `lib/nav-menu.ts` (o ⌘K pega sozinho) e em `lib/modules.ts`.
Módulo continua com `key: "pcm"` (permissões existentes preservadas); o rótulo passa a
"Manutenção". Recursos novos: `solicitacoes` (inclusive "abrir SS", que deve ser concedível a
**todos**), `planos`, `medidores`, `relatorios`, `configuracoes`.

## 8. Integrações com o que já existe

| Módulo | Integração |
|---|---|
| **Estoque / Requisição** | `ordemServicoId` na RM e no item; "Requisitar peça" na OS abre o `RequisicaoCreateForm` com OS, centro de custo e natureza "Material de manutenção" preenchidos. Devolução abate o custo da OS. |
| **Compras** | "Solicitar compra" na OS gera SC com `ordemServicoId`; o PC herda; recebimento notifica o responsável da OS e tira de `AGUARDANDO_MATERIAL`. |
| **Contas a Pagar / Contratos** | Terceiro vinculado ao PC, CP ou contrato de manutenção (módulo Contratos). |
| **Imobilizado** | `ManutAtivo.imobilizadoId`; melhoria capitalizável e baixa de componente pela precedência de linha existente. Baixa do bem sugere inativar o ativo. |
| **SST** | `SstMaquina.ativoId` substitui a importação do Engeman (a tela "importar do Engeman" vira "vincular ativo"); inspeção NOK e incidente com máquina abrem SS (`origem = SST_*`); OS que mexe em proteção NR-12 sinaliza o SST para reavaliar. |
| **PCP** | `CentroTrabalho.ativoId`; medidores automáticos por produção/horas de forno; OS com `exigeParada` programada aparece no sequenciamento do forno como indisponibilidade; parada não planejada do forno fica visível no board. |
| **RH** | Colaborador/equipe e custo-hora; colaborador desligado sai das equipes. |
| **Centros de custo / Naturezas** | Custo gerencial por `centroCustoId` da OS (herda do ativo); grupos fabris (Manutenção Mecânica/Elétrica) já existem. |
| **Notificações** | SS nova, emergência, OS atribuída, peça chegou, preventiva vencendo/atrasada. |
| **GED** | Fotos, laudos, manuais e relatórios de terceiros como `Documento` ligado ao ativo/OS. |
| **Projetos** | **Sem integração** (decisão vigente do módulo Projetos). |

## 9. Migração do Engeman (importação única)

Script de importação idempotente (`scripts/` ou rota admin descartável, como no import de CP), com
**prévia** (contagens, conflitos) e **aplicar**, backup `_bkp_engeman_*` antes, reexecutável até o
corte (atualiza pelo `*Legado`):

| Engeman | ERP | Observação |
|---|---|---|
| `APLIC` (+ `TAGGRU` p/ árvore), `LOCAPLIC` | `ManutAtivo` | locais viram nós `LOCAL`; `codAplLegado` guardado; criticidade/regime de `AtivoCriticidade`/`AtivoRegime` aplicados. |
| `TIPMANUT` | `ManutTipo` | `contaComoFalha` a partir de `pcm_tipos_corretivos`/auto-detecção atual. |
| `DEFEITO`, `CAUSA` | `ManutCatalogo` | |
| `SETEXE`, `FUNC` | `ManutEquipe`, membros | `FUNC` → `Colaborador` por nome/CPF; sem match = lista para o PCM resolver. |
| `PLAMANUT` (+ tarefas, se existirem) | `ManutPlano` | `ultimaExecucao` = última OS concluída do plano. |
| `ORDSERV`, `REGSERV`, `ORDXPAR`, `ORDXFUN` | `ManutOrdem`, falha, parada, apontamentos | histórico (período a decidir — §11); `numeroLegado` = `ORDSERV.TAG`; OBS em RTF passa por `stripRtf`. |
| `RequisicaoMaterial.os` (texto) | `ordemServicoId` | match pelo nº legado quando bater; o resto fica só no texto. |
| `SstMaquina.codApl`, `CentroTrabalho.codApl`, `FechamentoMtbf.codApl` | `ativoId` | backfill pelo `codAplLegado`. |

**Corte**: data D definida com o PCM. Até D−1 o import roda de novo para pegar o que mudou; em D o
Engeman para de receber lançamentos, roda o último import e as OS abertas lá viram OS abertas
aqui. Validação do corte: MTBF/MTTR dos 12 meses anteriores calculados pelo ERP batem com os
relatórios atuais (diferença explicada OS a OS).

Depois do corte (fase 4): remover `src/lib/engeman.ts`, `pcm-ativos.ts`/`pcm-mtbf.ts` antigos, a
dependência `mssql`, a tela `/configuracoes/integracoes/db-engeman`, as chaves `db_engeman_*` e
`pcm_tipos_corretivos`, e as colunas `codApl` das outras tabelas.

## 10. Fases

| Fase | Entrega | Critério de pronto |
|---|---|---|
| **1 — Cadastro e espelho** | Modelos §4.1–4.3, import do Engeman reexecutável (ativos, tipos, catálogo, equipes, OS históricas), FKs em SST/PCP/Fechamento, **relatórios atuais repontados para os dados locais** (Ativos, Relatório de O.S., Quadro, Planos, MTBF/MTTR, FMEA, Qualidade). | PCM navega todas as telas atuais sem conexão ao Engeman; números batem com o Engeman. |
| **2 — Operação (corte)** | SS, OS completa (estados, apontamento, parada, falha, checklist, anexos), requisição/SC vinculadas, quadro com programação, planos por calendário com gerador, notificações, mobile. **Corte do Engeman.** | Uma semana operando só no ERP; nenhuma OS nova no Engeman. |
| **3 — Custo e indicadores** | Custo por OS/ativo (MO, material, terceiros), custo-hora, medidores e planos por uso (incl. PCP), painel, relatórios §7, backlog e aderência. | "Quanto custou o forno 2 no ano" respondido em uma tela. |
| **4 — Integrações e limpeza** | Indisponibilidade no sequenciamento do PCP, SS a partir do SST, sobressalentes com estoque mínimo, etiqueta QR, remoção do Engeman (§9). | Nenhuma referência a `mssql`/`codApl` no código. |

## 11. Decisões do dono (24/out/2026) e riscos

| # | Tema | Decisão |
|---|---|---|
| 1 | Data do corte | **A mais recente possível** — corte imediato. O Engeman já quase não recebia OS (4 em set, 1 em out/2026). Importa-se tudo até agora e o ERP passa a ser o único lugar. |
| 2 | Histórico | **Tudo** (mai/2025 → out/2026: 1.949 OS, 7,6 mil serviços, 6,2 mil materiais, 4,7 mil apontamentos). |
| 3 | Custo-hora da MO | Por **equipe** (`ManutEquipe.custoHora`), congelado no apontamento; histórico usa o `FUNC.CUSTO_HORA` do Engeman. Custo pela folha fica para depois. |
| 4 | Quem abre SS | **Todo usuário logado** (a tela `/pcm/solicitacoes` e a API são session-only; quem não tem o módulo vê só as próprias). |
| 5 | Conclusão da OS | **Duas etapas**: técnico ENCERRA (validações de parada/falha/checklist/cronômetro), PCM CONCLUI ou DEVOLVE. Concluir/devolver/reabrir/cancelar/planejar exigem `pcm.validacao.editar`. |
| 6 | Multiempresa | **Tramontin e Atlas**. O Engeman só tem ativos da Tramontin (o centro "PORTO ATLÁS" não tem ativo, só 20 OS) — tudo importa na Tramontin; a Atlas cadastra os seus no ERP. |
| 7 | Frota | **Caminhões entram como ativos** (tipo `VEICULO`, campo placa, horímetro/odômetro como medidor). |
| 8 | Acesso ao Engeman | Mantido só até rodar a importação em produção; depois a fase 4 remove `mssql`/`engeman.ts`. |

Implementação: `codApl` continua sendo a chave numérica do ativo (importados mantêm o CODAPL; novos
seguem max+1), por isso `AtivoCriticidade`/`AtivoRegime`/`FechamentoMtbf`/`SstMaquina.codApl`/
`CentroTrabalho.codApl` seguiram funcionando sem refatoração — a troca por FK `ativoId` fica na fase 4.
Serviços/falha ficam em `ManutOrdemServico` (linha a linha, como o REGSERV — uma OS pode ter mais de
um modo de falha), não no cabeçalho.

Medidores pelo PCP (fase 3) ficaram pendentes: as etapas apontadas das OPs não gravam o centro de
trabalho (`ItemOrdemProducao.centroTrabalho` vazio em todas as 467 etapas em prod), então não há como
atribuir produção/horas de forno a um ativo. Destrava quando o PCP passar a gravar o centro de trabalho.

Requisição de material: o campo O.S. virou busca das OS em aberto (`/api/pcm/os/abertas`, leitura
para pcm/compras/almoxarifado) — o material requisitado fica ligado à OS e entra no custo dela.

Atenção: o almoxarifado ainda lança requisições no estoque próprio do Engeman (185 em out/2026,
EPIs/insumos). Isso não é manutenção e não foi migrado — precisa de decisão à parte antes de desligar
o Engeman de vez.

Risco de adoção continua: técnico não apontar. Mitigação: cronômetro na OS, regra de encerramento que
não deixa fechar sem parada/falha, e (fase 4) QR na máquina.

## 12. Fora de escopo (explicitamente)

- Frota rodoviária completa (abastecimento, pneus, multas, documentos do veículo).
- Integração com sensores/CLP/IoT e preditiva automática (preditiva aqui = OS de inspeção com
  leitura numérica e faixa).
- Lançamento contábil próprio do módulo (material já é contabilizado pela requisição; MO pela folha;
  terceiros pela entrada/CP).
- Gestão de ferramentaria/empréstimo de ferramentas (pode virar fase futura).
- Integração com o Projetos.

## 13. Métricas de sucesso

- 100% das OS do mês registradas no ERP após o corte; zero acesso ao Engeman em 60 dias.
- ≥ 95% das OS corretivas concluídas com parada e falha preenchidas (hoje há OS com parada 0h).
- Aderência à preventiva medida todo mês para 100% dos ativos críticos A, e todo ativo A com ao
  menos um plano.
- Custo de manutenção por ativo disponível mensalmente, conciliando com o consumo de "Material de
  manutenção" do estoque (diferença = requisições sem OS, que devem cair mês a mês).
- Tempo médio de triagem de SS < 1 dia útil.

## 14. Simplificação (aprovada em 24/out/2026, referência de UX: Tractian CMMS)

Ordem: (a) ✔ publicar fase 4; (b) mapa da planta + Indicadores c/ Confiabilidade; (c) fusão de
telas; (d) limpeza dos cadastros herdados (lista final decidida pelo dono).

**Menu alvo (7 telas):** Painel (mapa da planta + números) · Ordens de Serviço (quadro único; a
Solicitação é a 1ª coluna, triar = arrastar) · Ativos (FMEA e indicadores como abas do ativo) ·
Planos (aderência como aba) · Custos e falhas (absorve Relatório de O.S.) · Indicadores (MTBF,
MTTR, Disponibilidade, Confiabilidade R(t)=e^(−t/MTBF) por ativo/período; "fechar mês" é um botão)
· Configurações (Qualidade do cadastro vira cartão no Painel).

**Saem:** Quadro de O.S. antigo, Relatório de O.S., Aderência dos planos (vira aba), Falhas por
tipo (duplicado de Configurações › Tipos), Fechamento mensal como tela própria.

**Cadastros:** Tipos 16 → 6 (Corretiva, Preventiva, Preditiva, Inspeção, Lubrificação, Melhoria);
Equipes 32 → ~6 de manutenção; catálogo curado (~30 sintomas, ~30 causas; mais usados primeiro).
Antigos ficam inativos (histórico preservado).

**OS:** 4 abas — Execução (MO + checklist) · Falha · Custos (materiais + terceiros) · Histórico.

**Mapa da planta:** blocos por área (nós LOCAL da árvore) posicionados pelo usuário uma vez
(posição salva), equipamentos como ladrilhos coloridos por status (operando / parado / em
manutenção / atenção / inativo) com nº de OS abertas; clique abre ativo/OS; drill-down planta →
área → equipamento; opcional planta baixa (imagem) com pinos.
